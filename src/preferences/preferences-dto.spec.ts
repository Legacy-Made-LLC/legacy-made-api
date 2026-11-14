import { updatePreferencesSchema, updateTimezoneSchema } from './dto';
import { registerTokenSchema } from '../push-notifications/dto/register-token.dto';

describe('preferences and push token DTOs', () => {
  it.each(['America/Denver', 'UTC', 'Etc/GMT+5'])(
    'accepts the IANA timezone %s',
    (timezone) => {
      expect(updateTimezoneSchema.safeParse({ timezone }).success).toBe(true);
    },
  );

  it.each(['-0700', '+05:00', '05:00', 'Not/AZone'])(
    'rejects the timezone %s',
    (timezone) => {
      expect(updateTimezoneSchema.safeParse({ timezone }).success).toBe(false);
    },
  );

  it('drops a client-sent enabled_at', () => {
    const parsed = updatePreferencesSchema.parse({
      notifications: { reminders: { enabled: true, enabled_at: 'soon' } },
    });
    expect(parsed.notifications.reminders).toEqual({ enabled: true });
  });

  it('accepts an Expo push token', () => {
    expect(
      registerTokenSchema.safeParse({
        token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'ios',
      }).success,
    ).toBe(true);
  });

  it.each(['not-a-token', `ExponentPushToken[${'x'.repeat(300)}]`])(
    'rejects the push token %s',
    (token) => {
      expect(registerTokenSchema.safeParse({ token }).success).toBe(false);
    },
  );
});
