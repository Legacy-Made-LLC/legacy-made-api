import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { userPreferences } from '../schema';
import {
  FREQUENCY_DAYS,
  Notifications,
  NotificationsSchema,
  TIME_OF_DAY_MINUTES,
} from './notification-schemas';

/**
 * Never-sent users idle longer than this many days get no reminder until they
 * open the app again. null = no activity gate. See `getEligibleReminderUsers`.
 */
export const REMINDER_NEVER_SENT_ACTIVE_WITHIN_DAYS: number | null = 90;

/**
 * How long after the preferred time a reminder can still go out, so a late or
 * skipped scheduler run delays it instead of moving it to the next day.
 */
export const REMINDER_CATCH_UP_MINUTES = 120;

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  /**
   * Returns the user's full preferences row with Zod defaults applied.
   * If no row exists, returns a synthetic object with all defaults.
   */
  async getPreferences() {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [row] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));

      if (!row) {
        return {
          userId,
          timezone: 'UTC',
          notifications: this.applyDefaults({}),
          updatedAt: null,
        };
      }

      return {
        ...row,
        notifications: this.applyDefaults(row.notifications),
      };
    });
  }

  /**
   * Deep-merges incoming notification preferences at the type level.
   * PATCH semantics — merges at the notification type level, never replaces the full blob.
   *
   * Sets `enabled_at` when reminders transition to enabled.
   * Resets `enabled_at` when re-enabling (disable → enable).
   */
  async updateNotifications(incoming: {
    reminders?: Partial<Notifications['reminders']>;
  }) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));

      const existingNotifications = this.applyDefaults(
        existing?.notifications ?? {},
      );

      const mergedReminders = incoming.reminders
        ? { ...existingNotifications.reminders, ...incoming.reminders }
        : existingNotifications.reminders;

      // Manage enabled_at lifecycle
      if (mergedReminders) {
        if (incoming.reminders?.enabled === false) {
          // Disabling: clear enabled_at
          mergedReminders.enabled_at = null;
        } else if (mergedReminders.enabled && !mergedReminders.enabled_at) {
          // Enabled but no enabled_at (first enable, re-enable, or backfill)
          mergedReminders.enabled_at = new Date().toISOString();
        }
      }

      const merged = this.applyDefaults({ reminders: mergedReminders });

      const now = new Date();

      if (existing) {
        const [updated] = await tx
          .update(userPreferences)
          .set({ notifications: merged, updatedAt: now })
          .where(eq(userPreferences.userId, userId))
          .returning();

        return {
          ...updated,
          notifications: this.applyDefaults(updated.notifications),
        };
      }

      const [created] = await tx
        .insert(userPreferences)
        .values({ userId, notifications: merged, updatedAt: now })
        .returning();

      return {
        ...created,
        notifications: this.applyDefaults(created.notifications),
      };
    });
  }

  /**
   * Upserts the user's timezone. Creates the preferences row if it does not exist.
   * Called automatically on every app open.
   */
  async upsertTimezone(timezone: string) {
    const userId = this.cls.requireUserId();
    const now = new Date();

    const [row] = await this.db.rls(async (tx) => {
      return tx
        .insert(userPreferences)
        .values({
          userId,
          timezone,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { timezone, updatedAt: now },
        })
        .returning();
    });

    return {
      ...row,
      notifications: this.applyDefaults(row.notifications),
    };
  }

  /**
   * Ensures a preferences row exists for a user with defaults.
   * Called on first push token registration so the scheduler can find them.
   */
  async ensurePreferencesExist(userId: string) {
    await this.db.bypassRls(async (tx) => {
      await tx
        .insert(userPreferences)
        .values({
          userId,
          notifications: this.applyDefaults({}),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: userPreferences.userId });
    });
  }

  /**
   * Query users eligible for a reminder right now.
   *
   * Called by the scheduler every 30 minutes (at :00 and :30). One pass:
   *
   * 1. **Sanitize** each row so one bad value can't fail the whole query (and
   *    with it every user's reminder): an unknown timezone falls back to UTC
   *    (logged), an unparseable `enabled_at` or `custom_time` is ignored
   *    (`try_timestamptz` from migration 0020), and only an
   *    explicit `enabled: false` opts out.
   *
   * 2. **Enabled**: `reminders.enabled` is not false. Reminders are opt-out
   *    and the app fills defaults on read, so most rows never stored the key.
   *
   * 3. **Has a device**: at least one push token. Without one there is
   *    nothing to deliver to.
   *
   * 4. **Time-of-day window**: from 15 minutes before the preferred local time
   *    until 2 hours after it. The ±15 minutes give every preferred minute a
   *    :00/:30 run (a 23:50 time goes out at 00:00); the rest catches up after
   *    a late or skipped run (a deploy at 18:00, the spring daylight-saving
   *    gap) but never across local midnight. Several runs can match; the
   *    scheduler's claim and step 5 send once.
   *
   * 5. **Frequency gate**, by the user's local calendar date, so "weekly" is
   *    exactly 7 days. (Comparing timestamps drifted to 8: each send is
   *    logged a few seconds after the run, so 7 days later it was still a few
   *    seconds short.) The scheduler logs each send at its run's start time.
   *    a. **Sent before**: last reminder's local date is at least
   *       `frequency` days ago.
   *    b. **Never sent**: `frequency / 2` days (rounded down: 3 for weekly)
   *       have passed since `enabled_at`, or since signup when reminders were
   *       never toggled. Never `updated_at`, which every app open resets.
   *
   * 6. **Activity gate** (never-sent users only, optional): the user opened
   *    the app within `neverSentActiveWithinDays` days. `updated_at` is
   *    bumped by the timezone upsert on every app open.
   *
   * @param options.neverSentActiveWithinDays skip never-sent users idle longer
   *   than this many days; null sends to all of them.
   * @param options.now evaluate at this instant instead of the database
   *   clock (the scheduler passes its run start).
   */
  async getEligibleReminderUsers(
    options: { neverSentActiveWithinDays?: number | null; now?: Date } = {},
  ): Promise<{ userId: string; timezone: string; notifications: unknown }[]> {
    const activeWithinDays =
      options.neverSentActiveWithinDays === undefined
        ? REMINDER_NEVER_SENT_ACTIVE_WITHIN_DAYS
        : options.neverSentActiveWithinDays;
    const now = options.now
      ? sql`${options.now.toISOString()}::timestamptz`
      : sql`NOW()`;

    return this.db.bypassRls(async (tx) => {
      const rows = await tx.execute<{
        user_id: string;
        timezone: string;
        notifications: unknown;
        tz_fallback: boolean;
      }>(sql`
        WITH sanitized AS (
          -- Step 1: values that could make a cast fail become NULL or a default.
          SELECT
            up.user_id,
            up.timezone,
            up.notifications,
            up.updated_at,
            u.created_at AS signed_up_at,
            -- Only real zone names (any case). Postgres also accepts POSIX
            -- strings like "+05:00" in AT TIME ZONE but reads the sign
            -- inverted, so those fall back to UTC too.
            CASE WHEN LOWER(up.timezone) IN (SELECT LOWER(name) FROM pg_timezone_names)
              THEN up.timezone ELSE 'UTC'
            END AS tz,
            up.notifications->'reminders' AS r
          FROM user_preferences up
          JOIN users u ON u.id = up.user_id
          WHERE COALESCE(LOWER(up.notifications->'reminders'->>'enabled'), '') <> 'false'
            AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = up.user_id)
        ),
        reminder_prefs AS (
          SELECT
            s.*,
            (${now} AT TIME ZONE s.tz) AS local_now,
            -- Preferred notification time as minutes since midnight
            CASE s.r->>'time_of_day'
              WHEN 'morning' THEN ${TIME_OF_DAY_MINUTES.morning}::int
              WHEN 'afternoon' THEN ${TIME_OF_DAY_MINUTES.afternoon}::int
              WHEN 'evening' THEN ${TIME_OF_DAY_MINUTES.evening}::int
              WHEN 'custom' THEN CASE
                WHEN s.r->>'custom_time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                THEN SPLIT_PART(s.r->>'custom_time', ':', 1)::int * 60
                  + SPLIT_PART(s.r->>'custom_time', ':', 2)::int
                ELSE ${TIME_OF_DAY_MINUTES.evening}::int
              END
              ELSE ${TIME_OF_DAY_MINUTES.evening}::int
            END AS preferred_minutes,
            CASE s.r->>'frequency'
              WHEN 'weekly' THEN ${FREQUENCY_DAYS.weekly}::int
              WHEN 'biweekly' THEN ${FREQUENCY_DAYS.biweekly}::int
              WHEN 'monthly' THEN ${FREQUENCY_DAYS.monthly}::int
              ELSE ${FREQUENCY_DAYS.weekly}::int
            END AS freq_days,
            -- Start of the first-reminder grace period: when reminders were
            -- turned on, else signup
            COALESCE(
              try_timestamptz(s.r->>'enabled_at'),
              s.signed_up_at
            ) AS effective_enabled_at
          FROM sanitized s
        ),
        windowed AS (
          SELECT
            rp.*,
            -- Minutes since the preferred time, in [-15, 1425)
            MOD(
              (EXTRACT(HOUR FROM rp.local_now)::int * 60
                + EXTRACT(MINUTE FROM rp.local_now)::int)
              - rp.preferred_minutes + 15 + 1440,
              1440
            ) - 15 AS minutes_since_preferred
          FROM reminder_prefs rp
        )
        SELECT w.user_id, w.timezone, w.notifications, w.tz <> w.timezone AS tz_fallback
        FROM windowed w
        -- Most recent reminder sent to each user (at most one row via LIMIT 1)
        LEFT JOIN LATERAL (
          SELECT nl.sent_at
          FROM notification_log nl
          WHERE nl.user_id = w.user_id
            AND nl.type = 'reminder'
          ORDER BY nl.sent_at DESC
          LIMIT 1
        ) last_sent ON true
        WHERE
          -- Step 4: within [preferred - 15 min, preferred + 2 h) ...
          w.minutes_since_preferred < ${REMINDER_CATCH_UP_MINUTES}::int
          -- ... and, past the first 15 minutes, that slot falls on today's
          -- local date: catch-up never crosses midnight. (Within 15 minutes it
          -- may, so a 23:50 reminder goes out at the 00:00 run.)
          AND (
            w.minutes_since_preferred < 15
            OR (w.local_now - make_interval(mins => w.minutes_since_preferred))::date
              = w.local_now::date
          )
          AND (
            -- Step 5a: sent before, at least freq_days local days ago
            (
              last_sent.sent_at IS NOT NULL
              AND (last_sent.sent_at AT TIME ZONE w.tz)::date
                <= w.local_now::date - w.freq_days
            )
            OR
            -- Step 5b: never sent, half the frequency after enabling/signup
            (
              last_sent.sent_at IS NULL
              AND (w.effective_enabled_at AT TIME ZONE w.tz)::date
                <= w.local_now::date - w.freq_days / 2
              -- Step 6: activity gate
              AND (
                ${activeWithinDays}::int IS NULL
                OR w.updated_at >= ${now} - make_interval(days => ${activeWithinDays}::int)
              )
            )
          )
      `);

      for (const r of rows.rows.filter((row) => row.tz_fallback)) {
        this.logger.warn(
          `Unknown timezone "${r.timezone}" for user ${r.user_id}; reminders use UTC`,
        );
      }

      return rows.rows.map((r) => ({
        userId: r.user_id,
        timezone: r.timezone,
        notifications: r.notifications,
      }));
    });
  }

  /**
   * Parse JSONB notifications through Zod schemas, applying defaults.
   * Defaults are defined on RemindersSchema (e.g. frequency → 'weekly').
   * The DTO uses .partial() which strips defaults for incoming PATCH data.
   */
  private applyDefaults(raw: unknown): Notifications {
    return NotificationsSchema.parse(raw ?? {});
  }
}
