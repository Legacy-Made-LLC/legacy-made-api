/**
 * Reminder delivery — integration test against a real Postgres.
 *
 * Covers the reminder scheduler's eligibility query, the send → log flow, Expo
 * receipt handling, and push-token registration under RLS.
 *
 * - Runs migrations itself, then creates a non-superuser role for the app
 *   connection so RLS is actually enforced (a superuser bypasses it).
 * - Only touches users whose id starts with `rem_test_`.
 * - Expo is faked; nothing leaves the machine.
 *
 * Gated by `DATABASE_URL_TEST` (an owner/superuser URL). Run via:
 *   DATABASE_URL_TEST=postgresql://... npm run test:integration
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, like, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { ApiConfigService } from '../src/config/api-config.service';
import { DbService } from '../src/db/db.service';
import { ApiClsService } from '../src/lib/api-cls.service';
import { PreferencesService } from '../src/preferences/preferences.service';
import { PushNotificationsService } from '../src/push-notifications/push-notifications.service';
import { ReminderSchedulerService } from '../src/push-notifications/reminder-scheduler.service';
import {
  notificationLog,
  pushTickets,
  pushTokens,
  userPreferences,
  users,
} from '../src/schema';

const DB_URL = process.env.DATABASE_URL_TEST;
const describeIfEnv = DB_URL ? describe : describe.skip;

const APP_ROLE = 'reminder_test_app';
const APP_ROLE_PASSWORD = 'reminder-test-only';
const TZ = 'America/Denver';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Thursday 2026-11-19 18:00 in Denver (UTC-7): an 18:00 run. */
const RUN_1800 = new Date('2026-11-20T01:00:00Z');
/** The 18:30 run the same evening. */
const RUN_1830 = new Date('2026-11-20T01:30:00Z');

class MutableCls {
  private store: Record<string, unknown> = {};
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  get(key: string) {
    return this.store[key];
  }
  requireUserId(): string {
    const userId = this.store['userId'];
    if (typeof userId !== 'string') throw new Error('No userId in test CLS');
    return userId;
  }
}

/** Expo client stand-in: answers tickets and receipts from per-token rules. */
class FakeExpo {
  ticketErrors = new Map<string, string>();
  receiptErrors = new Map<string, string>();
  private ticketTokens = new Map<string, string>();
  private nextTicket = 1;

  chunkPushNotifications<T>(messages: T[]): T[][] {
    return [messages];
  }
  chunkPushNotificationReceiptIds(ids: string[]): string[][] {
    return ids.length > 0 ? [ids] : [];
  }
  sendPushNotificationsAsync(messages: { to: string }[]) {
    return Promise.resolve(
      messages.map((message) => {
        const error = this.ticketErrors.get(message.to);
        if (error) {
          return { status: 'error', message: error, details: { error } };
        }
        const id = `rem_test_ticket_${this.nextTicket++}`;
        this.ticketTokens.set(id, message.to);
        return { status: 'ok', id };
      }),
    );
  }
  getPushNotificationReceiptsAsync(ids: string[]) {
    const receipts: Record<string, unknown> = {};
    for (const id of ids) {
      const token = this.ticketTokens.get(id) ?? id;
      const error = this.receiptErrors.get(token);
      receipts[id] = error
        ? { status: 'error', message: error, details: { error } }
        : { status: 'ok' };
    }
    return Promise.resolve(receipts);
  }
}

/** Build the app-role URL from the owner URL by swapping the credentials. */
function appRoleUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl);
  url.username = APP_ROLE;
  url.password = APP_ROLE_PASSWORD;
  return url.toString();
}

function fakeConfig(appUrl: string, allowlist: string[]): ApiConfigService {
  const values: Record<string, unknown> = {
    DATABASE_URL_APP: appUrl,
    DATABASE_URL_MIGRATIONS: DB_URL,
    NODE_ENV: 'test',
    PUSH_NOTIFICATION_ALLOWLIST: allowlist,
    EXPO_ACCESS_TOKEN: undefined,
  };
  return { get: (key: string) => values[key] } as unknown as ApiConfigService;
}

/** Expo-shaped token for a test user. */
const tokenFor = (userId: string) => `ExponentPushToken[${userId}]`;

describeIfEnv('Reminder delivery integration', () => {
  let ownerPool: Pool;
  let owner: ReturnType<typeof drizzle>;
  let cls: MutableCls;
  let db: DbService;
  let preferences: PreferencesService;
  let push: PushNotificationsService;
  let scheduler: ReminderSchedulerService;
  let expo: FakeExpo;

  /** Run `work` as the owner with RLS bypass on, in one transaction. */
  const asOwner = <T>(work: (tx: typeof owner) => Promise<T>) =>
    owner.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.bypass_rls_status', 'on', true)`,
      );
      return work(tx as unknown as typeof owner);
    });

  /**
   * Seed one user with a preferences row and, unless `token: false`, a push
   * token. Times are relative to RUN_1800.
   */
  async function seedUser(
    id: string,
    opts: {
      notifications?: Record<string, unknown>;
      signedUpDaysAgo?: number;
      lastOpenDaysAgo?: number;
      lastSentAt?: Date;
      token?: boolean;
      timezone?: string;
    } = {},
  ) {
    const daysAgo = (days: number) =>
      new Date(RUN_1800.getTime() - days * DAY_MS);
    await asOwner(async (tx) => {
      await tx.insert(users).values({
        id,
        email: `${id}@example.com`,
        createdAt: daysAgo(opts.signedUpDaysAgo ?? 60),
      });
      await tx.insert(userPreferences).values({
        userId: id,
        timezone: opts.timezone ?? TZ,
        notifications: opts.notifications ?? {},
        updatedAt: daysAgo(opts.lastOpenDaysAgo ?? 1),
      });
      if (opts.token !== false) {
        await tx
          .insert(pushTokens)
          .values({ userId: id, token: tokenFor(id), platform: 'ios' });
      }
      if (opts.lastSentAt) {
        await tx.insert(notificationLog).values({
          userId: id,
          type: 'reminder',
          channel: 'push',
          sentAt: opts.lastSentAt,
        });
      }
    });
  }

  const eligibleIds = async (
    now: Date,
    neverSentActiveWithinDays?: number | null,
  ) =>
    (
      await preferences.getEligibleReminderUsers({
        now,
        neverSentActiveWithinDays,
      })
    )
      .map((u) => u.userId)
      .filter((id) => id.startsWith('rem_test_'))
      .sort();

  const isEligible = async (userId: string, now: Date) =>
    (await eligibleIds(now, 90)).includes(userId);

  beforeAll(async () => {
    ownerPool = new Pool({ connectionString: DB_URL });
    owner = drizzle(ownerPool);

    await migrate(owner, { migrationsFolder: 'migrations' });

    // Non-superuser role for the app connection so RLS applies.
    await owner.execute(
      sql.raw(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$`),
    );
    await owner.execute(
      sql.raw(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};`),
    );

    await asOwner((tx) => tx.delete(users).where(like(users.id, 'rem_test_%')));

    cls = new MutableCls();
    const allowlist = [
      'rem_test_send_ok',
      'rem_test_send_dead',
      'rem_test_receipt',
    ];
    const config = fakeConfig(appRoleUrl(DB_URL!), allowlist);
    const apiCls = cls as unknown as ApiClsService;
    db = new DbService(config, apiCls);
    preferences = new PreferencesService(db, apiCls);
    push = new PushNotificationsService(db, apiCls, config, preferences);
    expo = new FakeExpo();
    (push as unknown as { expo: FakeExpo }).expo = expo;
    scheduler = new ReminderSchedulerService(preferences, push, db);
  });

  afterAll(async () => {
    await asOwner((tx) => tx.delete(users).where(like(users.id, 'rem_test_%')));
    await ownerPool.end();
    await (db.drizzle as unknown as { $client: Pool }).$client.end();
  });

  describe('eligibility', () => {
    beforeAll(async () => {
      // Bug 1: the "reminders on" default was never stored.
      await seedUser('rem_test_defaults');
      await seedUser('rem_test_disabled', {
        notifications: { reminders: { enabled: false } },
      });
      // Bug 5: nothing to deliver to.
      await seedUser('rem_test_no_token', { token: false });
      // Bug 3: logged 3 s after the run 7 days ago; used to wait an 8th day.
      await seedUser('rem_test_sent_7d', {
        lastSentAt: new Date(RUN_1800.getTime() - 7 * DAY_MS + 3000),
      });
      await seedUser('rem_test_sent_6d', {
        lastSentAt: new Date(RUN_1800.getTime() - 6 * DAY_MS + 3000),
      });
      // Bug 4: a :15 time used to fall between the :00 and :30 runs.
      await seedUser('rem_test_quarter', {
        notifications: {
          reminders: {
            enabled: true,
            time_of_day: 'custom',
            custom_time: '18:15',
          },
        },
        lastSentAt: new Date(RUN_1800.getTime() - 7 * DAY_MS),
      });
      // Bug 2: signed up yesterday; the grace period runs from signup.
      await seedUser('rem_test_new_signup', { signedUpDaysAgo: 1 });
      await seedUser('rem_test_enabled_yesterday', {
        notifications: {
          reminders: {
            enabled: true,
            enabled_at: new Date(RUN_1800.getTime() - DAY_MS).toISOString(),
          },
        },
      });
      // Activity gate: never sent, last opened the app 200 days ago.
      await seedUser('rem_test_idle', { lastOpenDaysAgo: 200 });
      // Idle but already receiving reminders: the gate doesn't apply.
      await seedUser('rem_test_idle_sent', {
        lastOpenDaysAgo: 200,
        lastSentAt: new Date(RUN_1800.getTime() - 7 * DAY_MS),
      });
    });

    it('picks the right users at the 18:00 run', async () => {
      expect(await eligibleIds(RUN_1800, 90)).toEqual([
        'rem_test_defaults',
        'rem_test_idle_sent',
        'rem_test_quarter',
        'rem_test_sent_7d',
      ]);
    });

    it('sends to idle never-sent users when the activity gate is off', async () => {
      expect(await eligibleIds(RUN_1800, null)).toContain('rem_test_idle');
    });

    it('catches up for 2 hours after the preferred time, then stops', async () => {
      // 18:30 and 19:30 Denver still deliver a missed 18:00 reminder; 20:00 doesn't.
      expect(await isEligible('rem_test_defaults', RUN_1830)).toBe(true);
      expect(
        await isEligible('rem_test_defaults', new Date('2026-11-20T02:30:00Z')),
      ).toBe(true);
      expect(
        await isEligible('rem_test_defaults', new Date('2026-11-20T03:00:00Z')),
      ).toBe(false);
    });

    it('sends at most once a day across the catch-up runs', async () => {
      await seedUser('rem_test_once_a_day');
      expect(await isEligible('rem_test_once_a_day', RUN_1800)).toBe(true);
      // The 18:00 run sends and logs it a few seconds later
      await asOwner((tx) =>
        tx.insert(notificationLog).values({
          userId: 'rem_test_once_a_day',
          type: 'reminder',
          channel: 'push',
          sentAt: new Date(RUN_1800.getTime() + 3000),
        }),
      );
      expect(await isEligible('rem_test_once_a_day', RUN_1830)).toBe(false);
    });

    it('never catches up across local midnight or sends tomorrow early', async () => {
      // 23:30 Denver reminder, due tonight (Thu 2026-11-19)
      await seedUser('rem_test_late_night', {
        notifications: {
          reminders: {
            enabled: true,
            time_of_day: 'custom',
            custom_time: '23:30',
          },
        },
        lastSentAt: new Date('2026-11-13T06:30:02Z'),
      });
      // 00:15 Denver reminder, due Friday morning, not Thursday night
      await seedUser('rem_test_after_midnight', {
        notifications: {
          reminders: {
            enabled: true,
            time_of_day: 'custom',
            custom_time: '00:15',
          },
        },
        lastSentAt: new Date('2026-11-13T07:00:02Z'),
      });
      const at2330 = new Date('2026-11-20T06:30:00Z');
      const at0000 = new Date('2026-11-20T07:00:00Z');
      const at0030 = new Date('2026-11-20T07:30:00Z');

      expect(await isEligible('rem_test_late_night', at2330)).toBe(true);
      expect(await isEligible('rem_test_late_night', at0030)).toBe(false);
      expect(await isEligible('rem_test_after_midnight', at2330)).toBe(false);
      expect(await isEligible('rem_test_after_midnight', at0000)).toBe(true);
    });

    it('delivers a time skipped by the spring daylight-saving change', async () => {
      // 02:15 doesn't exist in Denver on 2027-03-14; the 03:00 run catches up.
      await seedUser('rem_test_dst_gap', {
        notifications: {
          reminders: {
            enabled: true,
            time_of_day: 'custom',
            custom_time: '02:15',
          },
        },
        lastSentAt: new Date('2027-03-07T09:15:02Z'),
      });
      expect(
        await isEligible('rem_test_dst_gap', new Date('2027-03-14T09:00:00Z')),
      ).toBe(true);
    });

    it('still runs when some rows hold values Postgres cannot cast', async () => {
      await seedUser('rem_test_bad_tz', { timezone: '-0700' });
      await seedUser('rem_test_bad_enabled_at', {
        notifications: { reminders: { enabled: true, enabled_at: 'soon' } },
      });
      await seedUser('rem_test_bad_enabled', {
        notifications: { reminders: { enabled: 'maybe' } },
      });
      await seedUser('rem_test_bad_custom_time', {
        notifications: {
          reminders: {
            enabled: true,
            time_of_day: 'custom',
            custom_time: 'ab:cd',
          },
        },
      });

      const ids = await eligibleIds(RUN_1800, 90);

      // Good rows are unaffected
      expect(ids).toContain('rem_test_defaults');
      // Bad values fall back: junk enabled_at → signup date, junk enabled →
      // on, junk custom_time → 18:00
      expect(ids).toEqual(
        expect.arrayContaining([
          'rem_test_bad_enabled_at',
          'rem_test_bad_enabled',
          'rem_test_bad_custom_time',
        ]),
      );
      // Unknown timezone → UTC, where it's 01:00, so not now
      expect(ids).not.toContain('rem_test_bad_tz');
    });

    it('keeps weekly at 7 days across the spring daylight-saving change', async () => {
      // Sent Tue 2027-03-09 18:00 MST; next run Tue 2027-03-16 18:00 MDT is
      // only 6 days 23 hours later.
      await seedUser('rem_test_dst', {
        lastSentAt: new Date('2027-03-10T01:00:02Z'),
      });
      const ids = await eligibleIds(new Date('2027-03-17T00:00:00Z'), null);
      expect(ids).toContain('rem_test_dst');
    });
  });

  describe('sending', () => {
    const sendOne = async (userId: string) => {
      jest
        .spyOn(preferences, 'getEligibleReminderUsers')
        .mockResolvedValueOnce([{ userId, timezone: TZ, notifications: {} }]);
      await scheduler.sendReminders();
    };

    const logRows = (userId: string) =>
      asOwner((tx) =>
        tx
          .select()
          .from(notificationLog)
          .where(eq(notificationLog.userId, userId)),
      );

    it('logs the reminder and stores the ticket when Expo accepts it', async () => {
      await seedUser('rem_test_send_ok');
      await sendOne('rem_test_send_ok');

      expect(await logRows('rem_test_send_ok')).toHaveLength(1);
      const tickets = await asOwner((tx) =>
        tx
          .select()
          .from(pushTickets)
          .where(eq(pushTickets.userId, 'rem_test_send_ok')),
      );
      expect(tickets).toHaveLength(1);
    });

    it('does not log a reminder no device accepted, and drops the dead token', async () => {
      await seedUser('rem_test_send_dead');
      expo.ticketErrors.set(
        tokenFor('rem_test_send_dead'),
        'DeviceNotRegistered',
      );
      await sendOne('rem_test_send_dead');

      expect(await logRows('rem_test_send_dead')).toHaveLength(0);
      const tokens = await asOwner((tx) =>
        tx
          .select()
          .from(pushTokens)
          .where(eq(pushTokens.userId, 'rem_test_send_dead')),
      );
      expect(tokens).toHaveLength(0);
    });

    it('drops tokens whose receipt says DeviceNotRegistered', async () => {
      await seedUser('rem_test_receipt');
      await asOwner((tx) =>
        tx.insert(pushTickets).values({
          ticketId: 'rem_test_ticket_receipt',
          userId: 'rem_test_receipt',
          token: tokenFor('rem_test_receipt'),
          createdAt: new Date(Date.now() - 20 * 60 * 1000),
        }),
      );
      expo.receiptErrors.set('rem_test_ticket_receipt', 'DeviceNotRegistered');

      const result = await push.processReceipts();

      expect(result).toEqual({ checked: 1, ok: 0, errors: 1 });
      const remaining = await asOwner(async (tx) => ({
        tokens: await tx
          .select()
          .from(pushTokens)
          .where(eq(pushTokens.userId, 'rem_test_receipt')),
        tickets: await tx
          .select()
          .from(pushTickets)
          .where(eq(pushTickets.ticketId, 'rem_test_ticket_receipt')),
      }));
      expect(remaining.tokens).toHaveLength(0);
      expect(remaining.tickets).toHaveLength(0);
    });
  });

  describe('token registration under RLS', () => {
    it('moves a device token to the account that signs in on it', async () => {
      // Bug 9: the token row belonged to the previous account on the device.
      await seedUser('rem_test_old_account');
      await seedUser('rem_test_new_account', { token: false });

      cls.set('userId', 'rem_test_new_account');
      await push.registerToken({
        token: tokenFor('rem_test_old_account'),
        platform: 'ios',
      });

      const [row] = await asOwner((tx) =>
        tx
          .select()
          .from(pushTokens)
          .where(eq(pushTokens.token, tokenFor('rem_test_old_account'))),
      );
      expect(row.userId).toBe('rem_test_new_account');
    });

    it('still blocks reading another user’s tokens through the app role', async () => {
      cls.set('userId', 'rem_test_defaults');
      const visible = await db.rls((tx) => tx.select().from(pushTokens));
      expect(visible.every((t) => t.userId === 'rem_test_defaults')).toBe(true);
    });
  });
});
