# Legacy Made — Security & Encryption Reference

*Internal Reference Document — Backend/API Focus*

---

> **Purpose:** This document defines Legacy Made's security architecture and end-to-end encryption implementation. Part One covers the strategic context. Part Two is the authoritative technical reference for the backend implementation, reflecting the current state of the codebase.

---

# PART ONE — Strategic Overview

---

## 1. Why Security Is Central to Legacy Made

Legacy Made asks people to share the most sensitive information of their lives — financial accounts, legal documents, digital access details, and personal messages intended for people they love. This is not productivity data or social content. It is irreplaceable, deeply personal, and consequential in ways that extend beyond the user's own lifetime.

As an early-stage startup with a small team and no established reputation, Legacy Made cannot rely on brand trust or institutional credibility to reassure users. The security architecture itself must carry that weight. Users need to know — not just believe — that their data is truly theirs.

The decision to implement end-to-end encryption from the outset, rather than retrofitting it later, reflects both a product conviction and a practical reality: it is far simpler to build correctly now than to migrate thousands of users' data to an encrypted architecture later.

---

## 2. Core Security Principles

| Principle | Description |
|---|---|
| **Data belongs to the user** | Legacy Made's servers store encrypted ciphertext. Without the user's key, the data is meaningless — including to Legacy Made. |
| **Encryption covers everything** | All personal data — text fields, images, documents, and video — is encrypted before it leaves the user's device. |
| **Transparency over trust** | Where Legacy Made does hold keys (account recovery), users are given a clear, plain-language explanation before opting in. |
| **No passwords stored** | Users are guided to record where and how to find passwords, not the passwords themselves. Legacy Made is not a password manager. |
| **Architecture over promises** | Security guarantees are built into the system design, not asserted in marketing copy. |

---

## 3. What Is Encrypted

All personal user data is end-to-end encrypted. This includes:

- Text fields — names, account details, personal notes, wishes, and messages
- Documents — PDFs, scans, and any uploaded files
- Images — photographs and other image uploads
- Video — personal legacy messages and recordings

Encryption happens on the user's device before data is transmitted. Legacy Made's servers and storage infrastructure (Cloudflare R2, Neon) receive and store only encrypted bytes. No plaintext personal data ever resides on Legacy Made's servers.

Files carry an `isEncrypted` boolean flag in the database so the client knows whether decryption is required before rendering.

---

## 4. Media Storage

All media — images, documents, and video — is stored in Cloudflare R2. Video is stored as standard MP4 files and played back natively on device. No third-party video platform is used.

This decision was deliberate. Managed video platforms require server-side transcoding, which means decrypting video before processing — fundamentally incompatible with end-to-end encryption. Storing MP4 files directly in R2 preserves the encryption guarantee, eliminates a vendor dependency, and reduces ongoing cost.

---

## 5. Account Recovery

End-to-end encryption presents an inherent tension: if only the user holds the key, a lost key means permanently lost data. For a product whose purpose is ensuring critical information survives difficult circumstances, this would be an unacceptable failure mode.

Legacy Made addresses this through an optional, transparent account recovery program. Users who opt in allow Legacy Made to hold a securely stored recovery key that can be used to restore access to their plan if their device is lost and no other backup exists.

> **Important:** Opting into account recovery necessarily gives Legacy Made the technical ability to decrypt a user's data. This is explained clearly at the point of opt-in. Users who do not opt in retain complete zero-knowledge encryption — Legacy Made cannot access their data under any circumstances.

Users who do not opt into Legacy Made recovery are given two alternative backup options:

- **Downloadable key file** — a file the user saves somewhere safe, such as a password manager or secure physical location.
- **Recovery phrase** — a human-readable sequence of words (similar to a crypto wallet) that can be used to restore access.

---

## 6. Multi-Device Access

Users may access Legacy Made across multiple devices. Each device generates its own key pair — keys are not copied between devices.

- **If account recovery is enabled** — the new device retrieves and decrypts the user's DEK via the KMS recovery mechanism. The process is seamless and requires no action from the user beyond authenticating.
- **If account recovery is not enabled** — the user links devices via a QR code scan. The existing device and the new device exchange identifiers through a time-limited server-side session. The new device then generates its own key pair, registers it, and the existing device re-encrypts DEK copies for the new key.

---

## 7. Trusted Contact Sharing

Legacy Made allows users to share selected information with trusted contacts — family members or designated individuals who should have access to some or all of the user's plan.

Sharing requires that the trusted contact has an active Legacy Made account. This is a deliberate design decision: sharing encrypted data requires an exchange of cryptographic keys, and that exchange requires both parties to be registered.

Once both parties have accounts, the key exchange happens automatically. The trusted contact does not need to be online at the same time — the encrypted access key waits on the server until the contact next opens the app.

If a trusted contact's access is revoked, their server-side DEK copies for that plan are deleted immediately. They can no longer decrypt any new or updated data. Data already accessed and cached on their device before revocation is outside Legacy Made's technical control — an inherent limitation of any sharing system.

---

## 8. Access Upon Passing *(Future Feature)*

The ability to deliver a user's plan to designated contacts after the user has passed is a planned future capability. It is not included in the current release.

When this feature is introduced, it will require Legacy Made to hold an escrow key for delivery — similar to the account recovery mechanism. The cryptographic architecture already supports this via the per-plan escrow DEK type.

---

## 9. What Legacy Made Does Not Do

- Store passwords — users are guided to record locations and retrieval instructions instead
- Read user data — all content is encrypted before it reaches Legacy Made's infrastructure
- Use managed video platforms that require server-side decryption
- Offer SOC 2 certification at this stage — this is a future milestone tied to enterprise expansion

---
---

# PART TWO — Technical Implementation Reference

---

## T1. Stack Context

| Component | Detail |
|---|---|
| **Database** | Neon (PostgreSQL) with Drizzle ORM and Row Level Security |
| **API** | NestJS — all key management and DEK operations handled here; encryption/decryption happens on-device |
| **Auth** | Clerk — OTP-based, passwordless. No stable secret for key derivation. |
| **Storage** | Cloudflare R2 — images, documents, video (MP4). Presigned URLs for access control. |
| **Mobile** | Expo (React Native) — iOS Keychain / Android Keystore for secure enclave storage |
| **Key Management** | AWS KMS (RSA_4096 asymmetric key for escrow, symmetric CMK retained for other uses) — holds Legacy Made's recovery key only |
| **Video** | No managed platform. MP4 stored in R2, played natively on device. |

---

## T2. Encryption Primitives

### Symmetric Encryption — Content

All content (text, files, video) is encrypted with AES-256-GCM using a per-plan Data Encryption Key (DEK). AES-256-GCM provides both confidentiality and integrity — tampered ciphertext will fail to decrypt.

### Asymmetric Encryption — Key Exchange

Each user has one or more ECDH key pairs (P-256 curve). Public keys are stored server-side in Neon. Private keys live exclusively in the device secure enclave (iOS Keychain / Android Keystore) and never leave the device.

### Envelope Encryption — The Core Pattern

1. **Generate DEK** — a random 256-bit symmetric key, created client-side on first use, one per plan
2. **Encrypt content** — all user data encrypted with the plan's DEK using AES-256-GCM
3. **Encrypt the DEK** — DEK encrypted with recipients' public keys. Multiple encrypted copies exist per plan (see T5).
4. **Store** — encrypted content in R2 / Neon; encrypted DEK copies in Neon. Nothing plaintext.
5. **Decrypt** — device fetches encrypted DEK copy for the relevant plan, decrypts with private key from secure enclave, decrypts content with DEK.

---

## T3. Key Architecture

### Multi-Key Model

Each user can register multiple public keys. Each key has a server-assigned `keyVersion` (monotonically increasing per user) and a `keyType`:

| Key Type | Purpose |
|---|---|
| `device` | Generated on a specific device, stored in that device's secure enclave |
| `recovery` | Offline backup key (downloadable file, recovery phrase, password manager) |

Keys also carry an optional `deviceLabel` (e.g. "iPhone 15") for user-facing identification.

### Per-Plan DEK Isolation

Each plan has its own DEK. Encrypted DEK copies are scoped to `(planId, ownerId, recipientId, keyVersion, dekType)`. This means:

- Revoking a contact from Plan A does not affect their DEK copies for Plan B
- Each device key version gets its own DEK copy per plan
- A user with 3 devices and 2 plans will have 6 owner DEK copies (3 keys x 2 plans)

### First Launch Flow

1. Client calls `POST /encryption/setup` with `{ publicKey, planId, encryptedDek, deviceLabel? }`
2. Server verifies zero existing keys (throws `409 Conflict` if any exist)
3. Server atomically inserts the key (`keyVersion: 1`, `keyType: 'device'`) and the owner's DEK copy
4. Client is walked through backup options (escrow, downloadable file, or recovery phrase)

### Adding Subsequent Keys

1. Client calls `POST /encryption/keys` with `{ publicKey, keyType, deviceLabel? }`
2. Server uses `SELECT ... FOR UPDATE` to lock the user's key rows and determine the next version
3. Server inserts the new key with `keyVersion: maxExisting + 1`
4. Client is responsible for re-encrypting DEK copies for the new key version

### Key Deletion

`DELETE /encryption/keys/:keyVersion` removes a **device** key and all associated encrypted DEK copies in a single transaction. Only `keyType: 'device'` keys can be deleted via this endpoint — recovery keys are managed through the DEK endpoints (`DELETE /encryption/deks`). Returns 404 if the key version does not exist or is not a device key.

### Key Rotation

There is no server-side "rotate" operation. Rotation is a client-side workflow: delete old key, register new key, re-encrypt DEK copies. This keeps the server stateless with respect to rotation semantics.

---

## T4. Key Backup & Account Recovery

Three backup mechanisms are available, presented to the user during onboarding:

### Option A — Legacy Made Escrow (Optional Opt-In)

The client fetches the KMS RSA_4096 public key via `GET /encryption/escrow/public-key`, encrypts the DEK locally using RSA-OAEP-SHA256, and sends the ciphertext to the server via `POST /encryption/escrow`. The server stores the ciphertext directly in Neon as a DEK copy with `dekType: 'escrow'` and `keyVersion: 0`. The server never sees the plaintext DEK during enrollment — only during recovery (when KMS decrypts with the private key that never leaves hardware).

**Disclosure shown to user at opt-in:**

> *"Enabling Legacy Made account recovery allows us to decrypt and retrieve your plan data if you lose access to all your devices. Your data is protected by industry-standard security practices and our recovery key is stored in a dedicated hardware security system. This is optional — you can use a personal backup instead."*

**Revocation:** Users can revoke escrow at any time via `DELETE /encryption/escrow?planId=<uuid>`. This deletes the escrow DEK copy and logs an `escrow_revoked` audit event. Once revoked, Legacy Made can no longer decrypt the user's data for that plan via KMS. The user is notified by email.

**Recovery flow:**

1. Client calls `POST /encryption/recovery` with `{ planId, newPublicKey }`
2. Server logs an `escrow_recovery_initiated` event (IP, user agent)
3. Server fetches the escrow DEK copy for the plan, decrypts via KMS
4. Server returns the DEK plaintext over TLS
5. Server logs an `escrow_recovery_completed` event and sends an email notification to the user
6. Client re-encrypts the DEK with the new public key and stores it via `POST /encryption/deks`

All recovery events are auditable via `GET /encryption/recovery/events`.

### Option B — Downloadable Key File

The private key is exported (wrapped / encrypted with a user-chosen PIN) and saved as a file. The user stores this file somewhere safe. Legacy Made never receives or stores this file. The key is registered server-side with `keyType: 'recovery'`.

### Option C — Recovery Phrase

The private key is encoded as a BIP-39 compatible word list (12-24 words). The user writes this down and stores it physically. On recovery, the phrase is entered into the app to reconstruct the private key. The key is registered server-side with `keyType: 'recovery'`.

---

## T5. Multi-Recipient Encryption & Trusted Contacts

The DEK architecture naturally supports multiple recipients. For each party who should have access to a plan's content, encrypted copies of the plan's DEK are created — one per recipient key version.

### What Is Stored Server-Side

| Data | Stored Server-Side? | Encrypted? |
|---|---|---|
| Content (text, files, video) | Yes — R2 / Neon | Yes — AES-256-GCM with plan DEK |
| DEK (owner's copy, per key version) | Yes — Neon | Yes — with owner's public key |
| DEK (trusted contact copy, per key version) | Yes — Neon | Yes — with contact's public key |
| DEK (escrow copy) | Yes — Neon | Yes — with KMS recovery key |
| User's public keys | Yes — Neon | No — intentionally public |
| User's private keys | No | Device secure enclave only |
| File `isEncrypted` flag | Yes — Neon | No — metadata needed for client rendering |

### DEK Types

| `dekType` | Description |
|---|---|
| `device` | Plan DEK encrypted with one of the owner's device public keys. One per device key version. |
| `recovery` | Plan DEK encrypted with the owner's recovery public key. One per recovery key version. |
| `contact` | Plan DEK encrypted with a trusted contact's public key. One per key version per contact. |
| `escrow` | Plan DEK encrypted with KMS. `keyVersion: 0`. One per plan (if opted in). Created only via `POST /encryption/escrow`. |

> **Note:** The `POST /encryption/deks` endpoint accepts `device`, `recovery`, and `contact` types only. Escrow DEKs are exclusively managed through the `POST /encryption/escrow` endpoint to enforce KMS encryption.

### Sharing Flow

1. Plan owner's client fetches the contact's public keys via `GET /encryption/keys/:userId`
2. Client decrypts its own DEK using the private key from secure enclave
3. Client re-encrypts the DEK with each of the contact's public keys
4. Client stores each copy via `POST /encryption/deks` with `dekType: 'contact'`
5. Contact's device fetches its DEK copies via `GET /encryption/deks/mine/:ownerId?planId=...`

### Access Revocation

When a plan owner revokes a trusted contact:

- The server deletes all `contact`-type DEK copies for that recipient **scoped to the specific plan** (`trusted-contacts.service.ts` and `access-invitations.service.ts` both enforce `planId` in the WHERE clause)
- The contact immediately loses the ability to decrypt any data for that plan
- DEK copies for other plans (if any) are unaffected
- DEK rotation on revocation is intentionally deferred as disproportionate to the risk at current scale

When a trusted contact self-revokes access:

- The server deletes their own `contact`-type DEK copies for that plan
- Same isolation guarantees apply

---

## T6. Multi-Device Linking

### Path A — Escrow Enabled

If the user has opted into Legacy Made recovery, the new device authenticates via Clerk, initiates recovery via `POST /encryption/recovery`, and receives the DEK plaintext. The new device generates its own key pair, registers it via `POST /encryption/keys`, and encrypts DEK copies for the new key.

### Path B — Escrow Not Enabled (QR Code Session)

Device linking uses a server-side signaling channel. No key material passes through the server.

1. Existing device creates a session: `POST /encryption/device-link/session` — returns a `sessionCode` (random 16-byte base64url, expires in 5 minutes)
2. New device scans QR code containing the session code
3. Existing device deposits an encrypted payload: `POST /encryption/device-link/deposit`
4. New device claims the payload: `POST /encryption/device-link/claim`

In the multi-key model, the payload typically contains device identifiers and public keys for the new device to register its own key pair. The existing device then re-encrypts DEK copies for the new key.

Expired sessions are cleaned up by a scheduled cron job (hourly).

---

## T7. AWS KMS Configuration

### Asymmetric Key (Escrow — RSA_4096)

| Setting | Value |
|---|---|
| **Key type** | Asymmetric RSA_4096, key usage ENCRYPT_DECRYPT |
| **Algorithm** | RSAES_OAEP_SHA_256 |
| **Region** | Configurable via `AWS_KMS_REGION` (default: `us-east-1`) |
| **Access control** | Dedicated IAM credentials scoped to the NestJS API only (`AWS_ACCESS_KEY_ID_KMS`, `AWS_SECRET_ACCESS_KEY_KMS`) |
| **Audit logging** | All KMS operations logged to AWS CloudTrail |

The public key is served to clients via `GET /encryption/escrow/public-key` (cached server-side for 24 hours). Clients encrypt DEKs locally with RSA-OAEP-SHA256. The private key never leaves KMS hardware — only used for recovery decryption.

### Symmetric Key (Retained)

| Setting | Value |
|---|---|
| **Key type** | Symmetric AES-256 CMK |
| **Key rotation** | Enable automatic annual rotation |

The symmetric key (`AWS_KMS_KEY_ARN`) is retained for potential future uses but is no longer used for escrow operations.

### IAM Permissions

```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Decrypt",
    "kms:GetPublicKey",
    "kms:DescribeKey"
  ],
  "Resource": "<AWS_KMS_ASYMMETRIC_KEY_ARN>"
}
```

### Required Environment Variables

```
AWS_KMS_REGION=us-east-1
AWS_KMS_KEY_ARN=arn:aws:kms:us-east-1:ACCOUNT_ID:key/SYMMETRIC_KEY_ID
AWS_KMS_ASYMMETRIC_KEY_ARN=arn:aws:kms:us-east-1:ACCOUNT_ID:key/RSA_4096_KEY_ID
AWS_ACCESS_KEY_ID_KMS=...
AWS_SECRET_ACCESS_KEY_KMS=...
```

The RSA private key never exists in application code or the Neon database. All decrypt operations are API calls to KMS — the key material stays in AWS hardware.

---

## T8. Database Schema

### `user_keys` Table

Stores ECDH P-256 public keys. Each user can have multiple keys (one per device + recovery keys).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `user_id` | TEXT FK → users | Not unique (multi-key) |
| `public_key` | TEXT | Base64-encoded SPKI public key |
| `key_version` | INTEGER | Server-assigned, monotonically increasing per user |
| `key_type` | TEXT | `'device'` or `'recovery'` |
| `device_label` | TEXT | Nullable. e.g. "iPhone 15" |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:**
- `UNIQUE(user_id, key_version)`
- `INDEX(user_id)`

**RLS policies:**
- Any authenticated user can SELECT (public keys are public by definition)
- Only the key owner can INSERT/UPDATE/DELETE

### `encrypted_deks` Table

Stores encrypted DEK copies. Per-plan isolation with multi-key support.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `plan_id` | UUID FK → plans | Cascade delete |
| `owner_id` | TEXT FK → users | The plan owner |
| `recipient_id` | TEXT FK → users | Who this copy is for |
| `dek_type` | TEXT | `'device'`, `'recovery'`, `'contact'`, or `'escrow'` |
| `encrypted_dek` | TEXT | Base64-encoded ciphertext |
| `key_version` | INTEGER | Matches recipient's key version used to encrypt |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:**
- `UNIQUE(plan_id, owner_id, recipient_id, key_version, dek_type)`
- `INDEX(plan_id)`
- `INDEX(owner_id)`
- `INDEX(recipient_id)`

**RLS policies:**
- Owner can manage all DEK copies (full CRUD); INSERT requires plan ownership (`userOwnsPlan`) to prevent orphaned DEKs for non-owned plans
- Recipients can SELECT their own copies

### `key_recovery_events` Table

Audit trail for all KMS recovery operations.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | TEXT FK → users | |
| `event_type` | TEXT | `'recovery_key_registered'`, `'recovery_key_deregistered'`, `'escrow_recovery_initiated'`, `'escrow_recovery_completed'`, `'escrow_recovery_failed'`, `'escrow_revoked'` |
| `ip_address` | TEXT | Nullable |
| `user_agent` | TEXT | Nullable |
| `details` | JSONB | Nullable — e.g. `{ newPublicKey }` or `{ error }` |
| `created_at` | TIMESTAMPTZ | |

**RLS policies:**
- Users can SELECT and INSERT their own events only

### `device_linking_sessions` Table

Ephemeral sessions for QR-based device linking.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | TEXT FK → users | |
| `session_code` | TEXT UNIQUE | Random 16-byte base64url |
| `payload` | TEXT | Nullable — encrypted payload deposited by source device |
| `status` | TEXT | `'pending'` → `'claimed'` → `'completed'` / `'expired'` |
| `expires_at` | TIMESTAMPTZ | 5 minutes from creation |
| `created_at` | TIMESTAMPTZ | |

**RLS policies:**
- Users can only access their own sessions

### `files` Table — E2EE Addition

The existing `files` table includes an `is_encrypted` boolean (`default: false`) so the client knows whether a file's content requires decryption before rendering.

### `plans` Table — E2EE Addition

The existing `plans` table includes an `e2ee_enabled` boolean (`default: false`) that tracks whether E2EE has been activated for the plan.

---

## T9. API Reference

All endpoints are under the `/encryption` controller and require Clerk authentication.

### Setup & Keys

| Method | Path | Body / Params | Description |
|---|---|---|---|
| `POST` | `/encryption/setup` | `{ publicKey, planId, encryptedDek, deviceLabel? }` | First-launch atomic setup. Creates first key (`keyVersion: 1`, `keyType: 'device'`) and owner DEK copy. 409 if keys exist. Rate-limited. |
| `POST` | `/encryption/keys` | `{ publicKey, keyType, deviceLabel? }` | Register additional key. Requires existing keys. Server assigns next `keyVersion`. Rate-limited. |
| `DELETE` | `/encryption/keys/:keyVersion` | | Delete a device key and all its DEK copies. Recovery keys cannot be deleted here. |
| `GET` | `/encryption/keys/me` | | Get all keys for current user. Returns array (empty if none). |
| `GET` | `/encryption/keys/:userId` | | Get another user's public keys. Returns array with `keyType` and `deviceLabel`. |

### Encrypted DEKs

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `POST` | `/encryption/deks` | `{ planId, recipientId, dekType, encryptedDek, keyVersion }` | Store/upsert a DEK copy. `dekType` must be `device`, `recovery`, or `contact`. |
| `PUT` | `/encryption/deks` | `{ planId, newDeks: [{ recipientId, dekType, encryptedDek, keyVersion }] }` | Atomic DEK rotation. Deletes all non-escrow DEK copies for the plan, inserts new set. Rate-limited. |
| `GET` | `/encryption/deks/mine/:ownerId` | `?planId=<uuid>` (required) | Get my DEK copies from a specific owner for a plan. Returns array. |
| `GET` | `/encryption/deks` | `?planId=<uuid>` (optional) | List all DEK copies I own. Optional plan filter. |
| `DELETE` | `/encryption/deks` | `?planId=<uuid>&dekType=<type>&recipientId=<string>&keyVersion=<int>` | Delete DEK copies by type and plan. `recipientId` and `keyVersion` optional. |
| `GET` | `/encryption/deks/status/:ownerId/:recipientId` | `?planId=<uuid>` (required) | Check DEK status. Returns `{ exists, deks: [{ dekType, keyVersion }] }`. |

### Escrow & Recovery

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/encryption/escrow/public-key` | | Get KMS RSA_4096 public key (base64 SPKI/DER). Client uses this to encrypt the DEK locally. Rate-limited. |
| `POST` | `/encryption/escrow` | `{ planId, encryptedDek }` | Enable KMS escrow for a plan. Client sends RSA-OAEP ciphertext; server stores directly. Rate-limited. |
| `DELETE` | `/encryption/escrow?planId=<uuid>` | | Revoke KMS escrow for a plan. Deletes escrow DEK copy. Logs event, sends email. Rate-limited. |
| `POST` | `/encryption/recovery` | `{ planId, newPublicKey }` | Initiate recovery. Returns DEK plaintext. Logs event, sends email. Rate-limited. |
| `GET` | `/encryption/recovery/events` | | Get recovery audit history. |

### Device Linking

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/encryption/device-link/session` | | Create linking session. Returns `{ sessionCode, expiresAt }`. Rate-limited. |
| `POST` | `/encryption/device-link/deposit` | `{ sessionCode, encryptedPayload }` | Deposit payload into pending session. |
| `POST` | `/encryption/device-link/claim` | `{ sessionCode }` | Claim session payload. Returns `{ payload }`. |

### Plan E2EE Status

| Method | Path | Description |
|---|---|---|
| `POST` | `/encryption/plans/:planId/enable` | Enable E2EE for a plan. |
| `GET` | `/encryption/plans/:planId/status` | Get E2EE status for a plan. |

### Rate Limits

| Endpoint Group | Short (per second) | Medium (per minute) |
|---|---|---|
| Setup, key registration | 3 / 1s | 10 / 60s |
| Escrow public key | 3 / 1s | 10 / 60s |
| Escrow enable/revoke, recovery | 1 / 10s | 3 / 60s |
| Device link session | 3 / 1s | 10 / 60s |

---

## T10. Access Control — Layered Approach

Security is enforced at multiple independent layers. Bypassing one does not compromise the others.

| Layer | Description |
|---|---|
| **Layer 1 — Clerk Auth** | All API requests require a valid Clerk JWT. No unauthenticated access to any endpoint. |
| **Layer 2 — RLS in Neon** | PostgreSQL Row Level Security restricts database reads to rows the authenticated user owns or has been granted access to. `app.user_id` is set via `SET LOCAL` in every transaction. |
| **Layer 3 — Signed URLs** | R2 media is never publicly accessible. All reads require a time-limited presigned URL generated by the NestJS API after auth checks pass. |
| **Layer 4 — E2EE** | Even if all prior layers were bypassed, all content is encrypted. Without the DEK, ciphertext is useless. |
| **Layer 5 — KMS** | The recovery key is held in AWS KMS hardware. It cannot be extracted — only used via authenticated API calls, all of which are logged to CloudTrail. |

---

## T11. Module Structure

```
src/encryption/
  encryption.module.ts          # NestJS module (providers, controllers, exports)
  encryption.controller.ts      # All /encryption/* routes
  encryption.service.ts         # Key management, DEK operations, escrow, recovery
  kms.service.ts                # AWS KMS client wrapper (encrypt/decrypt only)
  device-linking.service.ts     # QR session management + cron cleanup
  dto/
    setup-encryption.dto.ts     # First-launch setup
    register-public-key.dto.ts  # Additional key registration
    store-encrypted-dek.dto.ts  # DEK storage/upsert
    enable-escrow.dto.ts        # KMS escrow opt-in
    initiate-recovery.dto.ts    # Recovery initiation
    deposit-payload.dto.ts      # Device linking deposit
    claim-session.dto.ts        # Device linking claim
    index.ts                    # Barrel exports
```

`EncryptionModule` exports `EncryptionService` for use by other modules (e.g., trusted contacts DEK cleanup on revocation).

---

## T12. Known Limitations

### JavaScript String Immutability

During recovery operations, DEK plaintext is transiently present in server memory as JavaScript strings (from the KMS decrypt response and the HTTP response body). While `Buffer` instances are explicitly zeroed after use (`buffer.fill(0)`), JavaScript strings are immutable and cannot be deterministically overwritten — they persist in memory until garbage collected.

With the asymmetric escrow model, the server never sees plaintext during escrow enrollment (the client encrypts locally). Plaintext exposure is limited to recovery operations only.

This is a fundamental runtime limitation, not a code defect. The risk is mitigated by:
- TLS transport encryption for all request/response data
- Short-lived request contexts (strings are scoped to handler functions)
- Key material is only transiently present during recovery operations (not enrollment)
- Node.js GC typically reclaims short-lived strings quickly

### Trusted Contact Re-Invitation

When a previously revoked trusted contact is re-invited, their `clerkUserId` is preserved (not reset to null). This is intentional: it allows the plan owner's client to immediately set up an encrypted DEK copy for the contact without waiting for them to re-accept. The contact's `accessStatus` is reset to `'pending'`, so RLS policies (which check `access_status = 'accepted'`) still block data access until the contact formally re-accepts the invitation.

---

## T13. Deliberately Deferred

| Item | Notes |
|---|---|
| **SOC 2 Certification** | Deferred until product matures and enterprise expansion is prioritized. |
| **Password Storage** | Not supported. Users guided to store location/hint only. |
| **Access Upon Passing** | Future feature. Architecture supports it via per-plan escrow DEK. |
| **DEK Rotation on Revoke** | Accepted limitation. Server-side DEK deletion is sufficient. Rotation adds significant complexity for marginal security gain. |
| **Video DRM** | Not applicable — no managed video platform. MP4 in R2 with E2EE. |
