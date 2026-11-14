import type { ErrorEvent } from '@sentry/nestjs';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Replaces every email address in `text` with `[email]`. */
export function redactEmailText(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email]');
}

/**
 * Sentry `beforeSend` hook that strips email addresses from an event.
 *
 * Several services log the recipient's address in their error messages
 * (e.g. "Failed to send invitation email to …"). Those lines stay in the
 * Railway logs but never leave for Sentry.
 *
 * @param event - the event about to be sent; mutated in place
 * @returns the same event
 */
export function redactEmails(event: ErrorEvent): ErrorEvent {
  if (event.message) {
    event.message = redactEmailText(event.message);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = redactEmailText(exception.value);
    }
  }

  if (event.extra) {
    event.extra = JSON.parse(
      redactEmailText(JSON.stringify(event.extra)),
    ) as Record<string, unknown>;
  }

  return event;
}
