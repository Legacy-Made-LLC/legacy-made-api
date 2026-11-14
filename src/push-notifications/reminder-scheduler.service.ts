import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  async sendReminders(): Promise<void> {
    this.logger.log('Checking for eligible reminder recipients...');

    // Every send in this run is logged at the run's start, so a run that
    // spills past local midnight still counts as the slot's day.
    const runStartedAt = new Date();
    let sent = 0;
    let undelivered = 0;
    let failed = 0;

    try {
      const users = await this.preferencesService.getEligibleReminderUsers();

      for (const user of users) {
        try {
          if (await this.sendReminder(user.userId, runStartedAt)) {
            sent++;
          } else {
            undelivered++;
          }
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
      return;
    }

    this.logger.log(
      `Reminder check complete: ${sent} sent, ${undelivered} not accepted by Expo, ${failed} failed`,
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
   *
   * @param runStartedAt start of the scheduler run; logged as `sent_at`.
   * @returns true when Expo accepted the reminder for at least one device.
   */
  private async sendReminder(
    userId: string,
    runStartedAt: Date,
  ): Promise<boolean> {
    const claimId = await this.claimReminderSlot(userId, runStartedAt);
    if (!claimId) {
      this.logger.debug(
        `Reminder for user ${userId} already claimed; skipping`,
      );
      return false;
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
      if (accepted === 0) await this.releaseClaim(claimId);
    }

    if (accepted > 0) this.logger.debug(`Sent reminder to user ${userId}`);
    return accepted > 0;
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

  /** Delete a claim whose reminder wasn't delivered. */
  private async releaseClaim(claimId: string): Promise<void> {
    await this.db.bypassRls(async (tx) => {
      await tx.delete(notificationLog).where(eq(notificationLog.id, claimId));
    });
  }
}
