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
   * 1. **Enabled**: `reminders.enabled` is true, or the `reminders` key is
   *    missing. Reminders are opt-out and the app fills defaults on read, so
   *    most rows never stored the key; only an explicit `false` opts out.
   *
   * 2. **Has a device**: at least one push token. Without one there is
   *    nothing to deliver to.
   *
   * 3. **Time-of-day window**: the user's local minute-of-day falls in
   *    [preferred - 15, preferred + 15), modulo 1440. The window is 30 minutes
   *    wide and half-open, so exactly one of the :00/:30 runs matches any
   *    preferred minute, including :15 and :45.
   *
   * 4. **Frequency gate**, by the user's local calendar date. The window
   *    matches once a day, so comparing dates means "weekly" is exactly 7
   *    days. (Comparing timestamps drifted to 8: each send is logged a few
   *    seconds after the run, so 7 days later it was still a few seconds
   *    short.)
   *    a. **Sent before**: last reminder's local date is at least
   *       `frequency` days ago.
   *    b. **Never sent**: half the frequency has passed since `enabled_at`,
   *       or since signup when reminders were never toggled. Never
   *       `updated_at`, which every app open resets.
   *
   * 5. **Activity gate** (never-sent users only, optional): the user opened
   *    the app within `neverSentActiveWithinDays` days. `updated_at` is
   *    bumped by the timezone upsert on every app open.
   *
   * @param options.neverSentActiveWithinDays skip never-sent users idle longer
   *   than this many days; null sends to all of them.
   * @param options.now evaluate at this instant instead of the database clock
   *   (tests only).
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
      }>(sql`
        WITH reminder_prefs AS (
          -- Pre-compute derived values from JSONB so the WHERE clause stays clean.
          SELECT
            up.*,
            -- User's current local date and time as minutes since midnight
            (${now} AT TIME ZONE up.timezone)::date AS local_today,
            EXTRACT(HOUR FROM ${now} AT TIME ZONE up.timezone)::int * 60
              + EXTRACT(MINUTE FROM ${now} AT TIME ZONE up.timezone)::int
              AS current_minutes,
            -- Preferred notification time as minutes since midnight
            CASE up.notifications->'reminders'->>'time_of_day'
              WHEN 'morning' THEN ${TIME_OF_DAY_MINUTES.morning}::int
              WHEN 'afternoon' THEN ${TIME_OF_DAY_MINUTES.afternoon}::int
              WHEN 'evening' THEN ${TIME_OF_DAY_MINUTES.evening}::int
              WHEN 'custom' THEN COALESCE(
                SPLIT_PART(NULLIF(up.notifications->'reminders'->>'custom_time', ''), ':', 1)::int * 60
                + SPLIT_PART(NULLIF(up.notifications->'reminders'->>'custom_time', ''), ':', 2)::int,
                ${TIME_OF_DAY_MINUTES.evening}::int
              )
              ELSE ${TIME_OF_DAY_MINUTES.evening}::int
            END AS preferred_minutes,
            -- Frequency in days
            CASE up.notifications->'reminders'->>'frequency'
              WHEN 'weekly' THEN ${FREQUENCY_DAYS.weekly}::int
              WHEN 'biweekly' THEN ${FREQUENCY_DAYS.biweekly}::int
              WHEN 'monthly' THEN ${FREQUENCY_DAYS.monthly}::int
              ELSE ${FREQUENCY_DAYS.weekly}::int
            END AS freq_days,
            -- Start of the first-reminder grace period: when reminders were
            -- turned on, else signup
            COALESCE(
              (up.notifications->'reminders'->>'enabled_at')::timestamptz,
              u.created_at
            ) AS effective_enabled_at
          FROM user_preferences up
          JOIN users u ON u.id = up.user_id
          WHERE COALESCE((up.notifications->'reminders'->>'enabled')::boolean, true)
            AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = up.user_id)
        )
        SELECT rp.user_id, rp.timezone, rp.notifications
        FROM reminder_prefs rp
        -- Most recent reminder sent to each user (at most one row via LIMIT 1)
        LEFT JOIN LATERAL (
          SELECT nl.sent_at
          FROM notification_log nl
          WHERE nl.user_id = rp.user_id
            AND nl.type = 'reminder'
          ORDER BY nl.sent_at DESC
          LIMIT 1
        ) last_sent ON true
        WHERE
          -- Half-open window [preferred - 15, preferred + 15) on the
          -- 1440-minute clock; shifting by +15 and wrapping turns it into
          -- [0, 30). E.g. preferred 23:55, current 00:05 → (5 - 1435 + 15) mod 1440 = 25.
          MOD(rp.current_minutes - rp.preferred_minutes + 15 + 1440, 1440) < 30
          AND (
            -- Branch A: sent before, at least freq_days local days ago
            (
              last_sent.sent_at IS NOT NULL
              AND (last_sent.sent_at AT TIME ZONE rp.timezone)::date
                <= rp.local_today - rp.freq_days
            )
            OR
            -- Branch B: never sent, half the frequency after enabling/signup
            (
              last_sent.sent_at IS NULL
              AND (rp.effective_enabled_at AT TIME ZONE rp.timezone)::date
                <= rp.local_today - rp.freq_days / 2
              AND (
                ${activeWithinDays}::int IS NULL
                OR rp.updated_at >= ${now} - make_interval(days => ${activeWithinDays}::int)
              )
            )
          )
      `);

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
