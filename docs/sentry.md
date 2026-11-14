# Sentry

Errors and the reminder cron monitor go to the Sentry project `legacy-made/legacy-made-api`. Without `SENTRY_DSN` the SDK is off, so local dev and tests send nothing.

## How it's wired

| Piece | File | What it does |
| --- | --- | --- |
| `Sentry.init` | `src/instrument.ts` | First import in `src/main.ts`, so the SDK hooks `http`, Express and Nest as they load |
| `SentryGlobalFilter` | `src/app.module.ts` | Reports unhandled exceptions (500s); must stay the first `APP_FILTER` |
| `SentryLogger` | `src/lib/sentry-logger.ts` | Reports every `logger.error` / `logger.fatal`, so catch-and-log sites need no Sentry code |
| `redactEvent` | `src/lib/sentry-redaction.ts` | Strips emails, Expo push tokens, URL tokens and failed-query params before sending |
| `Sentry.setUser` | `src/auth/auth.guard.ts` | Clerk user ID only, scoped to the request |
| `@SentryCron` | `src/push-notifications/reminder-scheduler.service.ts` | Monitor `reminder-scheduler`; alerts on a missed, failed or overrun run |

To report a caught error, log it with the `Error` object as an argument: `this.logger.error('What failed', err)`. Passing `err.stack` (a string) loses the stack in Sentry.

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `SENTRY_DSN` | Railway | Empty or unset turns reporting off |
| `SENTRY_ENVIRONMENT` | optional | Defaults to `RAILWAY_ENVIRONMENT_NAME`, then `NODE_ENV` |
| `SENTRY_RELEASE` | optional | The SDK reads `RAILWAY_GIT_COMMIT_SHA` by itself |

## SDK v11 facts (verified against `@sentry/nestjs` 11.12.0)

- `sendDefaultPii` was removed. `dataCollection` replaces it and collects everything by default (cookies, bodies, IP, database query data), so `src/instrument.ts` turns each category off explicitly.
- `NodeRuntimeMetrics` is not a default integration, so nothing polls Sentry while the service is idle.
- Leaving `tracesSampleRate` unset skips loading the tracing instrumentation. Setting it to `0` still loads it.
- `onUnhandledRejectionIntegration` still defaults to `mode: 'warn'`: an unhandled rejection is reported and the process keeps running.
- `@SentryCron` reads the schedule and time zone from `@Cron`, including Nest's six-field expressions.
- Initializing through Node's `--require` flag is no longer supported (`--import` is). Importing `./instrument` first in `main.ts` is unaffected.
