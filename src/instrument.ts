/**
 * Sentry bootstrap. `main.ts` imports this file before anything else, so the
 * SDK can patch `http`, Express and Nest as they load.
 *
 * - Without `SENTRY_DSN` (local dev, tests) the SDK stays disabled and every
 *   `Sentry.*` call is a no-op.
 * - Runs before Nest's config validation, so it reads `process.env` directly.
 */
import * as Sentry from '@sentry/nestjs';
import { redactEmails } from './lib/sentry-redaction';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment:
    process.env.RAILWAY_ENVIRONMENT_NAME ??
    process.env.NODE_ENV ??
    'development',
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  // Errors and cron check-ins only; no performance tracing yet.
  tracesSampleRate: 0,
  // Plan data is sensitive: never send request bodies, cookies or IPs.
  // The authenticated user's Clerk ID is attached by AuthGuard.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    httpHeaders: {
      request: { allow: ['user-agent', 'content-type', 'accept'] },
      response: false,
    },
  },
  beforeSend: redactEmails,
});
