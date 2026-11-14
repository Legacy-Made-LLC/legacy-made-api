import { ConsoleLogger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Logger contexts whose errors Sentry has already captured. `SentryGlobalFilter`
 * reports an exception, then logs it under "ExceptionsHandler".
 */
const ALREADY_CAPTURED_CONTEXTS = new Set(['ExceptionsHandler']);

/**
 * Nest's console logger, plus a Sentry report for every `logger.error(...)`.
 *
 * Many failures here are caught and only logged (Resend and Loops sends,
 * Expo push, cron jobs), so routing `error` through Sentry covers all of
 * them without touching each call site.
 */
export class SentryLogger extends ConsoleLogger {
  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    captureLoggedError(message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(message, ...optionalParams);
    captureLoggedError(message, optionalParams, 'fatal');
  }
}

/**
 * Reports one `logger.error` call to Sentry.
 *
 * - An `Error` among the arguments is sent as an exception, with the log
 *   message attached as context.
 * - Otherwise the message itself is sent as an error-level message.
 * - Calls from contexts in `ALREADY_CAPTURED_CONTEXTS` are skipped.
 *
 * @param message - the first argument to `logger.error`
 * @param optionalParams - the remaining arguments; a `Logger` instance appends
 *   its context name as the last one
 * @param level - Sentry level for the event, exception or message
 */
export function captureLoggedError(
  message: unknown,
  optionalParams: unknown[],
  level: 'error' | 'fatal' = 'error',
): void {
  // A trailing stack string (static `Logger.error(msg, stack)`) is not a context.
  const last = optionalParams.at(-1);
  const context =
    typeof last === 'string' && !last.includes('\n') ? last : undefined;
  if (context && ALREADY_CAPTURED_CONTEXTS.has(context)) {
    return;
  }

  const error =
    message instanceof Error
      ? message
      : optionalParams.find((param) => param instanceof Error);

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    if (context) {
      scope.setTag('logger', context);
    }

    if (error) {
      if (error !== message) {
        scope.setExtra('log_message', describe(message));
      }
      Sentry.captureException(error);
      return;
    }

    if (isPlainObject(message)) {
      scope.setExtras(message);
    }
    Sentry.captureMessage(describe(message), level);
  });
}

/**
 * Turns a log message into a Sentry title. Structured messages such as
 * `{ msg: 'revenuecat_webhook', outcome: 'invalid_signature' }` become
 * "revenuecat_webhook: invalid_signature", so each outcome groups separately.
 */
function describe(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (isPlainObject(message)) {
    const parts = [message.msg, message.outcome].filter(
      (part) => typeof part === 'string',
    );
    return parts.length > 0 ? parts.join(': ') : JSON.stringify(message);
  }
  return String(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
