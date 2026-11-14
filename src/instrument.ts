/**
 * Sentry bootstrap. `main.ts` imports this file before anything else, so the
 * SDK can patch `http`, Express and Nest as they load.
 *
 * - Without `SENTRY_DSN` (local dev, tests) the SDK stays disabled and every
 *   `Sentry.*` call is a no-op.
 * - Runs before Nest's config validation, so it reads `process.env` directly.
 */
import * as Sentry from '@sentry/nestjs';
import { redactEvent } from './lib/sentry-redaction';

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  // Same variable as the ThreatZero and Shield APIs, then Railway's own name.
  environment:
    process.env.SENTRY_ENVIRONMENT ??
    process.env.RAILWAY_ENVIRONMENT_NAME ??
    process.env.NODE_ENV ??
    'development',
  // No `release`: the SDK reads RAILWAY_GIT_COMMIT_SHA (or SENTRY_RELEASE).
  // Errors and cron check-ins only. Leaving `tracesSampleRate` unset (not 0)
  // also skips loading the tracing instrumentation (Postgres, fetch, ...).

  // Plan data is sensitive: never send request bodies, cookies, IPs or
  // stack-frame variables (escrow recovery holds a plaintext key in one).
  // The authenticated user's Clerk ID is attached by AuthGuard.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    stackFrameVariables: false,
    // v11 turns this on by default; failed-query values can be plan data.
    databaseQueryData: false,
    // The SDK's built-in sensitive keys (token, secret, ...) still apply.
    urlQueryParams: { deny: ['email'] },
    httpHeaders: {
      request: { allow: ['user-agent', 'content-type', 'accept'] },
      response: false,
    },
  },
  beforeSend: redactEvent,
});

if (!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
  console.warn('SENTRY_DSN is not set; error reporting is disabled.');
}
