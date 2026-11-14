import * as Sentry from '@sentry/nestjs';
import { captureLoggedError } from './sentry-logger';
import { redactEmails } from './sentry-redaction';

/**
 * Runs the real Sentry SDK against an in-memory transport and returns the
 * events it would have sent.
 */
function collectEvents(): Sentry.ErrorEvent[] {
  const events: Sentry.ErrorEvent[] = [];
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    defaultIntegrations: false,
    beforeSend: (event) => {
      events.push(redactEmails(event));
      return null;
    },
  });
  return events;
}

describe('captureLoggedError', () => {
  let events: Sentry.ErrorEvent[];

  beforeEach(() => {
    events = collectEvents();
  });

  afterEach(async () => {
    await Sentry.close();
  });

  it('sends an Error argument as an exception, with the log line as context', async () => {
    captureLoggedError('Failed to send invitation email to a@b.com', [
      new Error('Resend 500 for a@b.com'),
      'EmailService',
    ]);
    await Sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0].exception?.values?.[0].value).toBe(
      'Resend 500 for [email]',
    );
    expect(events[0].extra?.log_message).toBe(
      'Failed to send invitation email to [email]',
    );
    expect(events[0].tags?.logger).toBe('EmailService');
  });

  it('sends a message-only error as an error-level message', async () => {
    captureLoggedError('User deleted webhook received without ID', [
      undefined,
      'UsersController',
    ]);
    await Sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('User deleted webhook received without ID');
    expect(events[0].level).toBe('error');
  });

  it('titles structured messages by msg and outcome', async () => {
    captureLoggedError(
      {
        msg: 'revenuecat_webhook',
        outcome: 'invalid_signature',
        durationMs: 3,
      },
      ['RevenuecatController'],
    );
    await Sentry.flush();

    expect(events[0].message).toBe('revenuecat_webhook: invalid_signature');
    expect(events[0].extra?.durationMs).toBe(3);
  });

  it('skips errors the global filter already reported', async () => {
    captureLoggedError('boom', ['stack', 'ExceptionsHandler']);
    await Sentry.flush();

    expect(events).toHaveLength(0);
  });
});
