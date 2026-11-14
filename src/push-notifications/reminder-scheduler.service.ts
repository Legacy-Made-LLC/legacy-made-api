import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SentryCron } from '@sentry/nestjs';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { PreferencesService } from '../preferences/preferences.service';
import { notificationLog } from '../schema';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  private readonly REMINDER_MESSAGES = [
    'Continue where you left off.',
    'Take one step at a time.',
    'Continue building your plan.',
    'Pick up where you left off.',
  ];

  constructor(
    private readonly preferencesService: PreferencesService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly db: DbService,
  ) {}

  // waitForCompletion: a slow run is never overlapped by the next one.
  @Cron(CronExpression.EVERY_30_MINUTES, { waitForCompletion: true })
  // Sentry alerts when a run is missed or overruns; schedule comes from @Cron.
  @SentryCron('reminder-scheduler', { checkinMargin: 5, maxRuntime: 25 })
  async sendReminders(): Promise<void> {
    this.logger.log('Checking for eligible reminder recipients...');

    // Every send in this run is logged at the run's start, so a run that
    // spills past local midnight still counts as the slot's day.
    const runStartedAt = new Date();
    let sent = 0;
    let skipped = 0;
    let undelivered = 0;
    let failed = 0;

    try {
      // Same instant for eligibility and sent_at, so app/DB clock skew can't
      // shift a midnight run's dates
      const users = await this.preferencesService.getEligibleReminderUsers({
        now: runStartedAt,
      });

      for (const user of users) {
        try {
          const outcome = await this.sendReminder(user.userId, runStartedAt);
          if (outcome === 'sent') sent++;
          else if (outcome === 'already-claimed') skipped++;
          else undelivered++;
        } catch (error) {
          failed++;
          this.logger.error(
            `Error processing reminder for user ${user.userId}`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to query eligible reminder users', error);
      // Rethrow so the Sentry cron monitor records this run as failed.
      throw error;
    }

    this.logger.log(
      `Reminder check complete: ${sent} sent, ${skipped} already sent, ${undelivered} not accepted by Expo, ${failed} failed`,
    );
  }

  /**
   * Send one user's reminder: claim the slot, send, keep the claim only if
   * Expo accepted it.
   *
   * 1. Claim: insert the `notification_log` row first, under a per-user lock,
   *    unless a reminder was already logged within the last day. Later runs
   *    in the catch-up window, or an overlapping run, see the row and skip.
   * 2. Send through Expo.
   * 3. If no device accepted it (no live token, all rejected) or the send
   *    threw (network, Expo auth), delete the claim so the user stays
   *    eligible and a later run retries.
   *    A network error after Expo already accepted can therefore cause one
   *    duplicate; that's preferred over losing the reminder.
   *
   * @param runStartedAt start of the scheduler run; logged as `sent_at`.
   */
  private async sendReminder(
    userId: string,
    runStartedAt: Date,
  ): Promise<'sent' | 'already-claimed' | 'not-accepted'> {
    const claimId = await this.claimReminderSlot(userId, runStartedAt);
    if (!claimId) {
      this.logger.debug(
        `Reminder for user ${userId} already claimed; skipping`,
      );
      return 'already-claimed';
    }

    const message =
      this.REMINDER_MESSAGES[
        Math.floor(Math.random() * this.REMINDER_MESSAGES.length)
      ];

    let accepted = 0;
    try {
      const result = await this.pushNotifications.sendToUser(
        userId,
        'Legacy Made',
        message,
        { type: 'reminder' },
      );
      accepted = result.accepted;
      if (accepted === 0) {
        this.logger.warn(
          `Reminder for user ${userId} not accepted by Expo (${result.tokens} token(s)); not logged as sent`,
        );
      }
    } finally {
      if (accepted === 0) await this.releaseClaim(claimId, userId);
    }

    if (accepted === 0) return 'not-accepted';
    this.logger.debug(`Sent reminder to user ${userId}`);
    return 'sent';
  }

  /**
   * Insert this user's `notification_log` row unless one exists from the last
   * day. The advisory lock serializes concurrent claims for the same user.
   *
   * @returns the new row's id, or null when a reminder was already logged.
   */
  private async claimReminderSlot(
    userId: string,
    runStartedAt: Date,
  ): Promise<string | null> {
    return this.db.bypassRls(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`reminder:${userId}`}))`,
      );
      const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO notification_log (user_id, type, channel, sent_at)
        SELECT ${userId}, 'reminder', 'push', ${runStartedAt.toISOString()}::timestamptz
        WHERE NOT EXISTS (
          SELECT 1 FROM notification_log
          WHERE user_id = ${userId}
            AND type = 'reminder'
            AND sent_at > ${runStartedAt.toISOString()}::timestamptz - INTERVAL '1 day'
        )
        RETURNING id
      `);
      return rows.rows[0]?.id ?? null;
    });
  }

  /**
   * Delete a claim whose reminder wasn't delivered. Never throws, so it can't
   * hide the send's own error. If it fails, the leftover row counts as a sent
   * reminder, so the user gets none until their next frequency period.
   */
  private async releaseClaim(claimId: string, userId: string): Promise<void> {
    try {
      await this.db.bypassRls(async (tx) => {
        await tx.delete(notificationLog).where(eq(notificationLog.id, claimId));
      });
    } catch (error) {
      this.logger.error(
        `Failed to release reminder claim for user ${userId}; the leftover row counts as sent, so no reminder until their next frequency period`,
        error,
      );
    }
  }
}
