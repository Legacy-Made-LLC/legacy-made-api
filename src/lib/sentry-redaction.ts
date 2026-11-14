import type { ErrorEvent } from '@sentry/nestjs';

/**
 * Each rule strips one kind of personal data or secret from any string in an
 * event. Order matters: query params are cut before the narrower rules run.
 */
const REDACTION_RULES: ReadonlyArray<[RegExp, string]> = [
  // DrizzleQueryError messages end with every bound value, which can be
  // unencrypted plan data (names, notes, titles). The SQL above it is kept.
  [/(\n|\\n)params: [\s\S]*$/, '$1params: [redacted]'],
  // Live tokens in public URL paths.
  [/(\/files\/share\/)[^/?#\s"]+/g, '$1[token]'],
  [/(\/access-invitations\/)[^/?#\s"]+/g, '$1[token]'],
  // Expo push tokens, which Expo echoes in its error and receipt messages.
  [/Expo(nent)?PushToken\[[^\]]*\]/g, 'ExpoPushToken[redacted]'],
  // Email addresses, plain or percent-encoded (as in query strings).
  [/[A-Z0-9._%+-]+(@|%40)[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
];

const MAX_DEPTH = 10;

/** Applies every redaction rule to `text`. */
export function redactText(text: string): string {
  return REDACTION_RULES.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

/**
 * Returns a copy of `value` with `redactText` applied to every string inside
 * it, including object keys' values at any depth up to `MAX_DEPTH`.
 */
function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      redactDeep(item, depth + 1),
    ]),
  );
}

/**
 * Sentry `beforeSend` hook that strips personal data and secrets from an event.
 *
 * Covers the free-text fields that can carry them: the message, exception
 * values, extra data, the request URL and query string, breadcrumbs, and tags.
 * Error messages often interpolate them (recipient emails, Expo receipts,
 * failed-query params), and those lines stay only in the Railway logs.
 *
 * @param event - the event about to be sent; mutated in place
 * @returns the same event
 */
export function redactEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) {
    event.message = redactText(event.message);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = redactText(exception.value);
    }
  }

  if (event.extra) {
    event.extra = redactDeep(event.extra) as typeof event.extra;
  }
  if (event.tags) {
    event.tags = redactDeep(event.tags) as typeof event.tags;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = redactDeep(
      event.breadcrumbs,
    ) as typeof event.breadcrumbs;
  }
  if (event.request) {
    event.request = redactDeep(event.request) as typeof event.request;
  }

  return event;
}
