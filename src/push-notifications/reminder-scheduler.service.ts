import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendReminders(): Promise<void> {
    this.logger.log('Checking for eligible reminder recipients...');

    let sent = 0;
    let undelivered = 0;
    let failed = 0;

    try {
      const users = await this.preferencesService.getEligibleReminderUsers();

      for (const user of users) {
        try {
          if (await this.sendReminder(user.userId)) {
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
   * Send one user's reminder and record it only if Expo accepted it.
   *
   * - The `notification_log` row is what starts the user's next frequency
   *   interval, so it is written only after Expo accepted at least one
   *   message. A user with no live token stays eligible and is retried at
   *   their next daily window.
   * - The push goes out before the row is written, so no transaction is held
   *   open across Expo's API call. If the insert then fails, the worst case is
   *   one extra reminder the next day.
   *
   * @returns true when Expo accepted the reminder for at least one device.
   */
  private async sendReminder(userId: string): Promise<boolean> {
    const message =
      this.REMINDER_MESSAGES[
        Math.floor(Math.random() * this.REMINDER_MESSAGES.length)
      ];

    const result = await this.pushNotifications.sendToUser(
      userId,
      'Legacy Made',
      message,
      { type: 'reminder' },
    );

    if (result.accepted === 0) {
      this.logger.warn(
        `Reminder for user ${userId} not accepted by Expo (${result.tokens} token(s)); not logged as sent`,
      );
      return false;
    }

    await this.db.bypassRls(async (tx) => {
      await tx.insert(notificationLog).values({
        userId,
        type: 'reminder',
        channel: 'push',
      });
    });

    this.logger.debug(`Sent reminder to user ${userId}`);
    return true;
  }
}
