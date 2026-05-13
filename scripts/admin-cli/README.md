# Legacy Made admin CLI

Thin wrapper over the `/admin/**` REST endpoints. Run from the repo root via:

```bash
npm run admin -- <command> [flags]
```

The `--` is required so flags reach the script intact instead of being eaten by npm.

## Setup

```bash
export LM_API_URL=https://api.legacymade.app          # or http://localhost:3000 in dev
export LM_ADMIN_TOKEN=<Clerk session JWT>
```

The token must belong to a user with `users.is_system_admin = true`. Set the flag once via SQL against the prod DB:

```sql
UPDATE users SET is_system_admin = true WHERE email = 'jared@gibsonops.com';
```

To grab a fresh Clerk session JWT, open the deployed web app while signed in, then in DevTools run `await window.Clerk.session.getToken()`. (Tokens expire — refresh when you get 401s.)

## Smoke test

```bash
npm run admin -- ping            # → { "ok": true } if auth + admin guard both pass
```

## Master subscription lifecycle

```bash
# 1. Resolve the owner's user ID
npm run admin -- lookup-user --email owner@acme.com

# 2. Create a master subscription
npm run admin -- create-master-sub \
  --owner-email owner@acme.com \
  --display-name 'Acme Estate Planning' \
  --seats 25 \
  --owner-consumes-seat

# 3. List / inspect
npm run admin -- list-master-subs
npm run admin -- show-master-sub --id <uuid>
npm run admin -- list-members --id <uuid>

# 4. Lifecycle changes
npm run admin -- set-seats        --id <uuid> --seats 50
npm run admin -- set-period-end   --id <uuid> --date 2026-12-31T00:00:00Z
npm run admin -- set-status       --id <uuid> --status suspended
npm run admin -- remove-member    --member-id <uuid>
```

`invite` lands with #25 and currently exits with a not-implemented message.

## Error handling

The CLI exits with code 1 on any non-2xx response and prints `error: <method> <path> → <status> <statusText>: <server JSON>` so the server's validation/business errors propagate clearly.

## Notes

- Auth is intentionally simple for MVP — Clerk session JWT pasted into env. Phase 2 may swap this for a dedicated machine-token / API-key flow.
- Phase 2 will also add a self-service portal for master subscription owners. The same `/admin/**` endpoints get an alternate guard (`MasterSubOwnerGuard`) so the CLI surface stays unchanged.
- Output is always JSON to stdout — pipe through `jq` for filtering.
