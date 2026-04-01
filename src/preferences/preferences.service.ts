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
   * The SQL does all the heavy lifting in a single pass:
   *
   * 1. **Filter**: Only users with `reminders.enabled = true`.
   *
   * 2. **Time-of-day window**: Converts NOW() to the user's local timezone,
   *    computes minutes-since-midnight, and checks if it falls within ±15 min
   *    of their preferred time. Uses LEAST(ABS(diff), 1440 - ABS(diff)) for
   *    correct modular arithmetic at the midnight boundary (e.g. preferred
   *    23:55, current 00:05 → diff = 10, not 1430).
   *
   * 3. **Last-sent lookup**: LEFT JOIN LATERAL on notification_log to find
   *    the most recent 'reminder' row per user. Using LATERAL avoids a
   *    correlated subquery in the WHERE clause.
   *
   * 4. **Frequency gate** (two branches, OR'd):
   *    a. **Has prior send**: `sent_at + frequency_interval <= NOW()`
   *    b. **Never sent**: Uses `enabled_at` (or `updated_at` as fallback)
   *       with **half** the frequency interval, so new users get their first
   *       reminder sooner than a full cycle.
   */
  async getEligibleReminderUsers(): Promise<
    { userId: string; timezone: string; notifications: unknown }[]
  > {
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
            -- User's current local time as minutes since midnight
            EXTRACT(HOUR FROM NOW() AT TIME ZONE up.timezone)::int * 60
              + EXTRACT(MINUTE FROM NOW() AT TIME ZONE up.timezone)::int
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
              ELSE ${TIME_OF_DAY_MINUTES.evening}
            END AS preferred_minutes,
            -- Frequency as days (full and half for first-reminder grace period)
            CASE up.notifications->'reminders'->>'frequency'
              WHEN 'weekly' THEN ${FREQUENCY_DAYS.weekly}::int
              WHEN 'biweekly' THEN ${FREQUENCY_DAYS.biweekly}::int
              WHEN 'monthly' THEN ${FREQUENCY_DAYS.monthly}::int
              ELSE ${FREQUENCY_DAYS.weekly}::int
            END AS freq_days,
            -- When reminders were enabled (for first-send grace period)
            COALESCE(
              (up.notifications->'reminders'->>'enabled_at')::timestamptz,
              up.updated_at
            ) AS effective_enabled_at
          FROM user_preferences up
          WHERE up.notifications->'reminders'->>'enabled' = 'true'
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
          -- Time-of-day window: ±15 min with midnight wraparound.
          -- LEAST picks the shorter arc around the 1440-minute clock,
          -- e.g. preferred=23:55 current=00:05 → LEAST(1430, 10) = 10.
          LEAST(
            ABS(rp.current_minutes - rp.preferred_minutes),
            1440 - ABS(rp.current_minutes - rp.preferred_minutes)
          ) < 15
          AND (
            -- Branch A: has been sent before — check full frequency interval
            (
              last_sent.sent_at IS NOT NULL
              AND last_sent.sent_at <= NOW() - make_interval(days => rp.freq_days)
            )
            OR
            -- Branch B: never sent — use half frequency for faster first reminder
            (
              last_sent.sent_at IS NULL
              AND rp.effective_enabled_at <= NOW() - make_interval(days => rp.freq_days / 2)
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
