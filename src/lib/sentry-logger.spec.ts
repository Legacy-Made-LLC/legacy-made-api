import * as Sentry from '@sentry/nestjs';
import { captureLoggedError } from './sentry-logger';
import { redactEvent, redactText } from './sentry-redaction';

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
      events.push(redactEvent(event));
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

  it('does not take a trailing stack string as the logger context', async () => {
    captureLoggedError('Unknown failure', ['Error: x\n    at foo (a.ts:1:1)']);
    await Sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0].tags?.logger).toBeUndefined();
  });

  it('sends fatal logs at fatal level', async () => {
    captureLoggedError('Process cannot continue', ['Main'], 'fatal');
    await Sentry.flush();

    expect(events[0].level).toBe('fatal');
  });

  it('skips errors the global filter already reported', async () => {
    // BaseExceptionFilter logs `(message, undefined, 'ExceptionsHandler')`.
    captureLoggedError('boom', [undefined, 'ExceptionsHandler']);
    await Sentry.flush();

    expect(events).toHaveLength(0);
  });
});

describe('redactText', () => {
  it.each([
    [
      'Failed query: insert into "entries" ("title") values ($1)\nparams: Mom\'s will',
      'Failed query: insert into "entries" ("title") values ($1)\nparams: [redacted]',
    ],
    [
      '{"msg":"Failed query: select 1\\nparams: a,b","after":"keep"}',
      '{"msg":"Failed query: select 1\\nparams: [redacted]","after":"keep"}',
    ],
    ['GET /files/share/abc123?x=1', 'GET /files/share/[token]?x=1'],
    [
      '/access-invitations/eyJhbGc.x.y/accept',
      '/access-invitations/[token]/accept',
    ],
    [
      'DeviceNotRegistered: "ExponentPushToken[xxxx]" is not registered',
      'DeviceNotRegistered: "ExpoPushToken[redacted]" is not registered',
    ],
    ['email=jane%40example.com', 'email=[email]'],
    ['to jane.doe+1@example.co.uk', 'to [email]'],
  ])('redacts %j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe('redactText performance', () => {
  it('stays fast on long text with no email in it', () => {
    const started = Date.now();
    redactText('a'.repeat(200_000));
    expect(Date.now() - started).toBeLessThan(500);
  });
});
