# Push Notification Service

### Legacy Made — Internal Technical Reference

---

## Overview

Legacy Made uses the **Expo Push Notification Service** to deliver native push notifications to iOS and Android devices — distinct from email (Loops) and any future SMS/text messaging.

### Why Expo Push Notification Service

- **Free** — no cost per message, no monthly fee
- **Unified token** — one Expo Push Token works across iOS (APNs) and Android (FCM), simplifying backend logic
- **EAS-integrated** — credentials are managed automatically through the existing EAS Build pipeline
- **No platform lock-in** — can migrate to direct FCM/APNs later if finer-grained control is needed

> **Rate limit:** 600 notifications/second per project. Not a concern at current scale.

---

## Architecture

```
Device → registers → Expo Push Notification Service
                                ↓
NestJS API ← stores token in Neon (push_tokens table)
                                ↓
NestJS sends POST to Expo Push API → Expo → APNs / FCM → Device
```

---

## Phase 1: Client Setup (Expo)

### Install Dependencies

```bash
npx expo install expo-notifications expo-device expo-constants
```

### `app.json` Plugin Config

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ]
  }
}
```

### `usePushNotifications` Hook

```ts
// hooks/usePushNotifications.ts
import { useEffect, useRef, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: false, // Calm, non-intrusive — fits Legacy Made's tone
    shouldSetBadge: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        savePushTokenToBackend(token); // POST to NestJS API
      }
    });

    // Foreground: notification received
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received:', notification);
      });

    // User tapped a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        // Handle deep linking here (e.g., navigate to a specific section)
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { expoPushToken };
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulators not supported

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return token;
}
```

### Permission Timing

**Do not request permission on app open.** Trigger the prompt after the user completes their first meaningful action (e.g., saving their first contact or finishing a section). This maximizes opt-in rate by making the value clear before asking.

---

## Phase 2: Backend Implementation (NestJS)

### Database Table

`push_tokens` table in Neon Postgres with RLS:

| Column       | Type                     | Notes                          |
| ------------ | ------------------------ | ------------------------------ |
| `id`         | `uuid` (PK, random)     |                                |
| `user_id`    | `text` (FK → users.id)  | Cascades on delete             |
| `token`      | `text` (unique)          | Expo Push Token                |
| `platform`   | `text` (nullable)        | `'ios'` or `'android'`         |
| `created_at` | `timestamp with tz`      |                                |
| `updated_at` | `timestamp with tz`      | Auto-updated via `$onUpdate()` |

**RLS policies:**
- `isCurrentUserPolicy` — users manage their own tokens
- `shouldBypassRlsPolicy` — system reads tokens for other users when sending notifications

### Module Structure

```
src/push-notifications/
├── push-notifications.module.ts       # @Global() module, exports service
├── push-notifications.service.ts      # Expo SDK integration
├── push-notifications.controller.ts   # Token registration endpoints
├── push-notifications.service.spec.ts
├── push-notifications.controller.spec.ts
└── dto/
    └── register-token.dto.ts          # Zod DTO
```

### API Endpoints

| Method   | Path                          | Description                |
| -------- | ----------------------------- | -------------------------- |
| `POST`   | `/push-notifications/token`   | Register/upsert push token |
| `DELETE`  | `/push-notifications/token`   | Remove push token          |

Both endpoints are protected by the global AuthGuard.

### Service Methods

- **`registerToken(dto)`** — Upserts token for the current user via `db.rls()`. Uses `onConflictDoUpdate` on the unique token column so a device re-registering just updates the userId/platform.
- **`removeToken(token)`** — Deletes token for the current user via `db.rls()`.
- **`sendToUser(userId, title, body, data?)`** — Looks up tokens via `db.bypassRls()`, filters with `Expo.isExpoPushToken()`, chunks and sends. Errors logged, not thrown (fire-and-forget pattern).

### Configuration

`EXPO_ACCESS_TOKEN` — Optional environment variable. Expo SDK works without it, but production should set it for higher rate limits.

---

## Phase 3: EAS Credentials

EAS handles credential provisioning automatically during the first development build.

- **iOS** — EAS manages the APNs key. Answer **yes** when prompted to enable push notifications during `eas build`.
- **Android** — Requires a Firebase project. Download `google-services.json` and place it at the project root. EAS Build expects this file.

> **Important:** Push notifications do not work on Android Emulators or iOS Simulators. A real physical device is required for testing.

---

## Notification Types (Implemented)

Three notification triggers are currently implemented:

| Trigger | Recipient | Title | Body | `data` Payload |
| --- | --- | --- | --- | --- |
| Contact accepted invite | Plan owner | `Invitation Accepted` | `{contactName} accepted your invitation. Share your encryption key to grant access.` | `{ type: 'invitation_accepted', planId }` |
| Contact declined invite | Plan owner | `Invitation Declined` | `{contactName} declined your invitation.` | `{ type: 'invitation_declined', planId }` |
| Owner shared DEK with contact | Trusted contact | `Plan Access Granted` | `You now have access to {ownerName}'s plan.` | `{ type: 'dek_shared', planId }` |

### Integration Points

- **Accepted/Declined** — `src/access-invitations/invitation-actions.service.ts` in `logAndNotifyOwner()`, after the email try/catch block.
- **DEK Shared** — `src/encryption/encryption.service.ts` in `storeEncryptedDek()`, fires after the RLS transaction returns when `dekType === 'contact'`.

All push notifications follow the same fire-and-forget pattern as email notifications (errors logged, not thrown).

---

## Deferred (Post-MVP)

The following are intentionally out of scope for the current phase:

- **Notification preferences screen** — user control over which notifications they receive
- **Rich notifications** — images, action buttons
- **Scheduled/recurring reminders** — NestJS cron job or `scheduleNotificationAsync`; relevant when retention becomes a priority
- **Receipt checking** — Expo provides receipt endpoints to confirm delivery; useful for cleaning up stale tokens

---

## Cost Summary

| Service                        | Cost                                                |
| ------------------------------ | --------------------------------------------------- |
| Expo Push Notification Service | Free                                                |
| APNs (Apple)                   | Free (included with $99/yr Apple Developer account) |
| Firebase/FCM (Android)         | Free                                                |

**No per-message fees. No monthly subscription. No surprises.**

---

## Key Decisions

| Decision          | Choice                            | Reason                                  |
| ----------------- | --------------------------------- | --------------------------------------- |
| Push service      | Expo Push Notification Service    | Simpler backend, unified token          |
| Firebase          | Android only, via EAS credentials | Required by FCM under the hood          |
| Permission timing | After first meaningful save       | Maximizes opt-in rate                   |
| Sound             | Off by default                    | Fits Legacy Made's calm, unhurried tone |
| Token storage     | `push_tokens` table in Neon       | Supports multiple devices per user      |
| Module pattern    | `@Global()` module                | Same as EmailModule — injectable anywhere |
