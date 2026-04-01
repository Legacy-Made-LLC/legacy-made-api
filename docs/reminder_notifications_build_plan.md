# Legacy Made — API Build Plan
## User Preferences & Push Notification Reminders
**Version 1.0 · NestJS + Drizzle + Neon + Expo Push**

---

## 1. Purpose & Scope

This document is a self-contained implementation plan for a coding agent. It covers all API-side work required to support user preferences and Phase 1 push notification reminders in the Legacy Made mobile app.

### In Scope

- `user_preferences` table — global per-user settings (timezone, JSONB notifications blob)
- `notification_log` table — idempotency + scheduler state
- `PreferencesModule` — GET and PATCH endpoints
- Timezone upsert — called automatically on app open, separate from push token registration
- Reminder scheduler — cron-based, respects user preferences, checks idempotency
- Notification service update — all send paths wired through preferences

### Out of Scope

- BullMQ / Redis — deferred, not needed at current scale
- `notification_log` as full audit log — it is scheduler state only at this stage
- Phase 2+ notification intelligence (section-awareness, behavioral suppression)
- Email notification preferences — Resend idempotency key handles email deduplication independently
- Frontend implementation — mobile-side preference UI is a separate workstream

---

## 2. Database Schema

### 2.1 `user_preferences`

One row per user. Created on first preference write or timezone upsert. Never deleted.

| Column | Type / Default | Notes |
|---|---|---|
| `user_id` | `UUID PRIMARY KEY` | FK → users.id |
| `timezone` | `TEXT DEFAULT 'UTC'` | IANA tz string e.g. `'America/Denver'` |
| `notifications` | `JSONB DEFAULT '{}'` | Keyed by notification type — see §2.3 |
| `updated_at` | `TIMESTAMPTZ` | Updated on every write |

### 2.2 `notification_log`

Used by the scheduler to enforce idempotency. One row per send event. The unique constraint on `idempotency_key` is the sole deduplication mechanism for push reminders.

| Column | Type / Default | Notes |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | |
| `idempotency_key` | `TEXT UNIQUE NOT NULL` | e.g. `reminder:userId:2026-W13` |
| `user_id` | `UUID NOT NULL` | FK → users.id |
| `type` | `TEXT NOT NULL` | `'reminder'` \| `'invite'` \| ... |
| `channel` | `TEXT NOT NULL` | `'push'` \| `'email'` |
| `sent_at` | `TIMESTAMPTZ` | Timestamp of successful send |

### 2.3 JSONB Notification Schema

The `notifications` column is a single JSONB blob keyed by notification type. Each type has its own shape. New types are added as new keys — no migration required.

Validated at the application layer using Zod. Never trust raw DB reads without parsing through the schema. All fields are optional at the DB level; defaults are applied at read time in the service.

```typescript
const RemindersSchema = z.object({
  enabled:     z.boolean().default(false),
  frequency:   z.enum(['weekly', 'biweekly', 'monthly']).default('weekly'),
  time_of_day: z.enum(['morning', 'afternoon', 'evening', 'custom']).default('evening'),
  custom_time: z.string().nullable().default(null),  // "HH:MM" 24h
});

const InvitesSchema = z.object({
  enabled: z.boolean().default(true),
});

const NotificationsSchema = z.object({
  reminders: RemindersSchema.optional(),
  invites:   InvitesSchema.optional(),
});
```

Preset `time_of_day` → local time mapping (used by scheduler):

- `morning` → 08:00
- `afternoon` → 12:00
- `evening` → 18:00 (default)
- `custom` → use `custom_time` field directly

---

## 3. PreferencesModule

### 3.1 File Structure

```
src/preferences/
  preferences.module.ts
  preferences.controller.ts
  preferences.service.ts
  dto/
    update-preferences.dto.ts
    update-timezone.dto.ts
```

### 3.2 Endpoints

| Endpoint | Description |
|---|---|
| `GET /preferences` | Returns full `user_preferences` row. Applies Zod defaults to any missing notification fields before returning. |
| `PATCH /preferences` | Deep-merges the request body into the existing `notifications` JSONB. Never overwrites the full blob — always merges at the type level. |
| `PUT /preferences/timezone` | Upserts user timezone. Called automatically on every app open. Creates the preferences row if it does not exist. |

### 3.3 PATCH Deep-Merge Behaviour

PATCH must merge at the notification type level, not replace the whole JSONB blob. This prevents a PATCH to `reminders` from wiping out `invites` settings.

```typescript
// Correct merge pattern in PreferencesService
const existing = await this.getNotifications(userId);
const merged = {
  ...existing,
  ...incoming,  // incoming is already Zod-parsed
  reminders: { ...existing.reminders, ...incoming.reminders },
  invites:   { ...existing.invites,   ...incoming.invites   },
};
await db.update(userPreferences).set({ notifications: merged }).where(...);
```

### 3.4 Auth

All preferences endpoints are protected by Clerk JWT guard. `user_id` is always extracted from the JWT — never accepted from the request body.

---

## 4. Timezone Upsert

Timezone is captured automatically from the device on every app open. This is a separate API call from push token registration.

### 4.1 Mobile Call

```typescript
// Called in App root useEffect on every launch
import * as Localization from 'expo-localization';

await api.put('/preferences/timezone', {
  timezone: Localization.getCalendars()[0].timeZone ?? 'UTC'
});
```

This is a fire-and-forget call. Failures should be caught and logged silently — never shown to the user.

### 4.2 API Handler

Upserts `user_preferences` with the provided timezone. Creates the row if it does not exist. Updates `updated_at` on every call.

```typescript
// Drizzle upsert
await db.insert(userPreferences)
  .values({ user_id, timezone, updated_at: new Date() })
  .onConflictDoUpdate({
    target: userPreferences.user_id,
    set: { timezone, updated_at: new Date() }
  });
```

---

## 5. Reminder Scheduler

A cron job running on the NestJS task scheduler. Queries eligible users, checks idempotency, sends reminders via Expo Push, and logs sends to `notification_log`.

### 5.1 Cron Cadence

Run every hour. The job itself determines which users are due based on their preferences and timezone. Running hourly gives acceptable local-time precision (±30 min worst case) without per-user job scheduling complexity.

```typescript
@Cron('0 * * * *')  // Every hour on the hour
async sendReminders() { ... }
```

### 5.2 Eligibility

A user is eligible for a reminder if all of the following are true:

- `reminders.enabled = true` in their `notifications` JSONB
- Their local time (derived from stored timezone) matches their configured `time_of_day` window (±30 min)
- Their local day of week is Sunday (Phase 1 default — all reminders send on Sunday)
- No `notification_log` row exists with `idempotency_key = reminder:{userId}:{isoWeek}`

Frequency mapping to idempotency key period:

- `weekly` → `reminder:{userId}:{year}-W{isoWeek}`
- `biweekly` → `reminder:{userId}:{year}-BW{Math.floor(isoWeek / 2)}`
- `monthly` → `reminder:{userId}:{year}-M{month}`

### 5.3 Scheduler Flow

```
1. Query all users where notifications->>'reminders'->>'enabled' = 'true'
2. For each user:
   a. Resolve their local time using stored timezone
   b. Check if local day = Sunday
   c. Check if local time is within time_of_day window (±30 min)
   d. Build idempotency_key for current period
   e. Check notification_log for existing row with that key
   f. If no row → send push notification, insert log row
   g. If row exists → skip silently
```

### 5.4 Notification Copy (Phase 1)

Rotate through these messages. No section awareness. No progress language. No urgency.

- "Continue where you left off."
- "Take one step at a time."
- "Continue building your plan."
- "Pick up where you left off."

Select by: `messages[Math.floor(Math.random() * messages.length)]`. Acceptable for Phase 1 — no personalization required.

### 5.5 Error Handling

If the Expo push send fails, log the error and do not insert to `notification_log`. The next hourly run will retry within the same period window, as no log row was written. If the period has elapsed before retry succeeds, the reminder is simply skipped — acceptable for a non-critical reminder flow.

---

## 6. Existing Notification Paths — Wiring Preferences

The two existing notification sends (trusted contact invite, invite accept/decline) must be wired through the `invites` preference before this build is complete.

| Notification | Preference Check |
|---|---|
| Trusted contact invite sent | Check recipient's `notifications.invites.enabled` before sending. Default `true` if preference row does not exist. |
| Invite accepted / declined | Check inviter's `notifications.invites.enabled` before sending. Default `true` if preference row does not exist. |

If the preference row does not exist for a user, treat `invites.enabled` as `true`. This preserves existing behavior for users created before the preferences system existed.

---

## 7. Non-Negotiables

- `user_id` is always sourced from Clerk JWT — never from request body or params
- PATCH preferences must deep-merge, never replace the full JSONB blob
- Scheduler must check `notification_log` before every send — no exceptions
- Timezone upsert must use `onConflictDoUpdate` — never fail if row already exists
- All notification send paths (existing and new) must respect preferences
- Reminder copy must not include urgency, completion percentage, or "almost done" language
- Zod validation must be applied at every read from the `notifications` JSONB column

---

## 8. What This Build Does Not Include

Explicitly out of scope. Do not implement these without a separate build plan:

- BullMQ, Redis, or any queue infrastructure
- Section-aware notifications (Phase 2)
- Behavioral suppression — skip if user was recently active (Phase 4)
- Email notification preferences or email reminder sends
- Frontend UI for preferences — separate mobile workstream
- Per-user delayed job scheduling — hourly cron with timezone math is sufficient

---

## 9. Dependency Summary

| Dependency | Usage |
|---|---|
| `@nestjs/schedule` | Cron job for hourly reminder scheduler |
| `date-fns-tz` or `luxon` | Timezone-aware time resolution in scheduler — use whichever is already in the codebase |
| `zod` | Runtime validation of JSONB notifications schema — already in use |
| Expo Push Notification Service | Already integrated — no changes to send mechanism |
| Drizzle ORM | Schema definitions and upsert queries — already in use |

No new infrastructure dependencies. No Redis. No additional hosted services.

---

*Legacy Made — Confidential Internal Document*
