# Integration tests

This directory holds end-to-end / integration specs that need infrastructure beyond the unit test mocks. They're separate from the colocated unit tests in `src/**/*.spec.ts`.

## Master subscriptions integration

`test/master-subscriptions.integration.e2e-spec.ts` exercises the master-subscriptions service layer against a real Postgres. It walks the full admin flow end-to-end: create → invite → preview → accept → entitlement resolves to `b2b` → seat overflow rejected → status transition validation → member removal reverts the entitlement → lapse cron flips `active → past_due` → JWT tampering rejected.

### How to run

```bash
DATABASE_URL_TEST=postgresql://<user>:<pw>@<host>/<db>?sslmode=require \
  npm run test:integration
```

The suite is **skipped** if `DATABASE_URL_TEST` is unset — so default `npm test` and `npm run test:e2e` runs don't depend on a live database.

### Requirements

- Postgres reachable at `DATABASE_URL_TEST`
- Migrations already applied (`npx drizzle-kit migrate` with `DATABASE_URL_MIGRATIONS=$DATABASE_URL_TEST`)
- The branch is wiped between runs — the suite truncates `users`, `subscriptions`, and the three `master_subscription_*` tables in `beforeAll`. **Don't point this at prod or a branch with data you care about.**

### What it doesn't cover

- HTTP layer (AuthGuard, ZodValidationPipe, etc.) — those are exercised manually via `npm run admin` against a booted API
- RLS policy enforcement — the suite runs as `neondb_owner` which bypasses RLS. RLS gets prod-validated by the regular app flows
