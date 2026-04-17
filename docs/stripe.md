# Stripe Integration

_Internal Reference — Legacy Made API_

---

## Overview

Stripe handles all billing for Legacy Made. Initial checkout is initiated from the web app (Stripe Checkout), and ongoing plan management — upgrades, downgrades, cancellations, payment methods — happens through the Stripe Customer Portal, reachable from the mobile app's Menu. We never render our own billing UI for plan changes.

Code lives in two modules:

- [`src/stripe/`](../src/stripe/) — thin wrapper around the `stripe` SDK (`StripeService`) and the webhook controller (`StripeWebhookController` actually lives under `src/subscriptions/` since it mutates our domain state).
- [`src/subscriptions/`](../src/subscriptions/) — domain logic: `/subscriptions/checkout`, `/subscriptions/portal`, `/subscriptions/me`, and the webhook controller at `/webhooks/stripe`.

The canonical return URL for the Customer Portal is `${APP_BASE_URL}/subscription/return`, which is a universal link that opens the mobile app (or falls back to web if the app isn't installed). The app's return screen then refreshes entitlements.

---

## Architecture

Three flows in play:

1. **Web-initiated checkout**
   1. User clicks "Subscribe" on the web.
   2. Web calls `POST /subscriptions/checkout` with `{ tier: 'individual' | 'family' }`.
   3. API returns a Stripe Checkout URL; web redirects.
   4. User completes payment; Stripe fires `checkout.session.completed` to `POST /webhooks/stripe`.
   5. Webhook handler activates the subscription row and sets the user's tier.

2. **App-initiated portal**
   1. User taps "Manage Subscription" in the app Menu.
   2. App calls `POST /subscriptions/portal`.
   3. API returns a Stripe Portal URL scoped to the user's customer.
   4. User makes changes in Stripe Portal; Stripe redirects back to `${APP_BASE_URL}/subscription/return`.
   5. Universal link opens the app's return screen; entitlements query is invalidated and refreshed.

3. **Ongoing lifecycle webhooks**
   - `customer.subscription.updated` — plan changed or status changed (e.g., active → past_due after a successful retry).
   - `customer.subscription.deleted` — canceled at end of period; we mark `canceled` and drop tier.
   - `invoice.payment_failed` — payment retry failed; we mark `past_due`. Entitlements policy is in `src/entitlements/`.

All three webhook paths write through `SubscriptionsService` so `subscriptions.status` stays in sync with Stripe's source of truth.

---

## Env vars

| Variable                     | Purpose                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`          | Server-side Stripe API key (`sk_test_*` or `sk_live_*`). Used by the `Stripe` SDK client in `StripeService`.                                                                                       |
| `STRIPE_WEBHOOK_SECRET`      | Signing secret for webhook payload verification. Local dev: from `stripe listen` output. Staging/prod: from Stripe dashboard webhook endpoint settings.                                            |
| `STRIPE_PRICE_ID_INDIVIDUAL` | Stripe Price ID for the individual tier. Used by `POST /subscriptions/checkout` and by webhook handlers to map price → tier.                                                                       |
| `STRIPE_PRICE_ID_FAMILY`     | Stripe Price ID for the family tier. Same role as above.                                                                                                                                           |
| `APP_BASE_URL`               | Canonical app URL (e.g., `https://app.mylegacymade.com`). The Portal redirects to `${APP_BASE_URL}/subscription/return` after user finishes. Also used by Checkout's `success_url` / `cancel_url`. |

See [`.env.example`](../.env.example) for the full inventory.

---

## API version pinning

The Stripe API version is pinned in `src/stripe/stripe.service.ts` (`new Stripe(key, { apiVersion: '…' })`). The currently pinned version is recorded in [`CLAUDE.md`](../CLAUDE.md) under the **Stripe** heading — that's the source of truth; don't chase a different value elsewhere.

**Bump protocol:**

1. When upgrading the `stripe` npm package, re-check `node_modules/stripe/types/apiVersion.d.ts` for the SDK's current `ApiVersion` / `LatestApiVersion`.
2. Skim the [Stripe API changelog](https://docs.stripe.com/upgrades) between the old and new versions; flag any breaking changes that touch our resources (`Subscription`, `Invoice`, `Checkout.Session`, `BillingPortal.Session`, `customers`, webhook event types).
3. Update the pinned string in `StripeService` and the value in `CLAUDE.md` in the same commit.
4. Run the webhook controller tests and hit staging with `stripe trigger` for each event type we handle before merging.

Bumps are intentional, reviewed, and paired with SDK upgrades. Never rely on the SDK's default / "latest" version implicitly.

---

## Idempotency

### Write idempotency

Every Stripe write in `StripeService` passes an `idempotencyKey` (a UUID per call): `customers.create`, `checkout.sessions.create`, `billingPortal.sessions.create`. See `src/stripe/stripe.service.ts`.

Value is currently modest — we don't have an auto-retry layer in front of these calls, and a user double-clicking a button hits the controller once (React Query dedupes in the app). But the keys harden against future retry layers, CDN retries, and any caller that wraps the API with its own retry logic. Sending an idempotency key on every write is cheap and Stripe-recommended; there's no reason not to.

### Webhook replay idempotency

A `processed_stripe_events` table dedupes webhook deliveries by Stripe event id (the `evt_*` string is the primary key). The flow:

1. Stripe POSTs an event to `/webhooks/stripe`.
2. Controller verifies signature; on failure returns 400.
3. Controller checks `processed_stripe_events` for the event id. If already present → early-return 200 with `{ received: true, deduped: true }`.
4. Dispatch to the matching handler.
5. On handler success, insert into `processed_stripe_events` with outcome `handled` or `skipped`.
6. On handler failure, we throw → 5xx → Stripe retries. The row was never inserted, so the retry starts clean.

The insert uses `onConflictDoNothing` on the PK so two concurrent deliveries of the same event id can't race each other into a duplicate-key error.

See `src/subscriptions/stripe-webhook.controller.ts` and `src/subscriptions/subscriptions.service.ts` (`isEventProcessed`, `recordProcessedEvent`).

---

## Local development

1. **Copy `.env.example` to `.env`** and fill in Stripe test-mode keys (`sk_test_*`, price IDs from your test dashboard).

2. **Install the Stripe CLI:**

   ```bash
   brew install stripe/stripe-cli/stripe
   ```

   (Or see [Stripe CLI installation docs](https://docs.stripe.com/stripe-cli) for other platforms.)

3. **Authenticate:**

   ```bash
   stripe login
   ```

4. **Forward webhooks to your local API:**

   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```

   On startup the CLI prints a signing secret like `whsec_abc123…`. Copy it into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the API.

5. **Trigger events** to exercise handlers without going through the full checkout flow:
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger customer.subscription.updated
   stripe trigger customer.subscription.deleted
   stripe trigger invoice.payment_failed
   ```
   Each triggers a real Stripe test-mode event that your `listen` terminal forwards to the API.

---

## Secret rotation

- **`STRIPE_SECRET_KEY`** — Rotate in Stripe dashboard → Developers → API keys → create a new secret key → update the env var in deployment (Fly secrets, etc.) → deploy. The previous key remains valid until you explicitly roll it in the dashboard, so you can overlap old and new without downtime. Roll the old key once the deploy is confirmed healthy.

- **`STRIPE_WEBHOOK_SECRET`** — Rotate in Stripe dashboard → Developers → Webhooks → select the endpoint → "Roll signing secret". Stripe will return a new `whsec_*` value. Update the env var and deploy. **Note:** our code currently accepts only one signing secret at a time (single-value env var), so there's a brief window where in-flight deliveries signed with the old secret will fail verification. For true zero-downtime rotation we'd need to accept a comma-separated pair temporarily. Flag as a future enhancement — not worth building until we have a rotation need.

---

## Troubleshooting

- **"Invalid webhook signature"** — `STRIPE_WEBHOOK_SECRET` doesn't match the secret emitted by `stripe listen` (dev) or the dashboard endpoint (staging/prod). For local dev, restart `stripe listen`, copy the freshly printed secret, and restart the API.

- **"No Stripe customer found" on `/subscriptions/portal`** — User has never completed checkout, so we have no `stripe_customer_id` for them. The app should gate the "Manage Subscription" button on an active subscription; send the user through initial checkout first.

- **"Unknown price ID" in logs** — `STRIPE_PRICE_ID_INDIVIDUAL` or `STRIPE_PRICE_ID_FAMILY` doesn't match a Price in your Stripe account, or is swapped (test Price in prod env, or vice versa). Check the price ID in the Stripe dashboard matches what's in the env. Webhook handlers log the offending price id before returning; look for `Unknown price ID:` in the API logs.

- **Webhook delivered but nothing happens** — Check the `processed_stripe_events` table; if the event id is present with outcome `skipped`, the event type isn't one we currently handle (see the `switch` in `StripeWebhookController`). Structured logs include the event type and outcome for every delivery — grep for the event id.
