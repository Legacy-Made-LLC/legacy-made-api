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

    try {
      const users = await this.preferencesService.getEligibleReminderUsers();

      for (const user of users) {
        try {
          await this.sendReminderInTransaction(user.userId);
          sent++;
        } catch (error) {
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

    this.logger.log(`Reminder check complete: ${sent} sent`);
  }

  /**
   * Insert the notification log entry and send the push notification
   * inside a single transaction. If the push send fails, the transaction
   * rolls back and the log entry is not persisted — the user remains
   * eligible on the next cron run.
   */
  private async sendReminderInTransaction(userId: string): Promise<void> {
    const message =
      this.REMINDER_MESSAGES[
        Math.floor(Math.random() * this.REMINDER_MESSAGES.length)
      ];

    await this.db.bypassRls(async (tx) => {
      await tx.insert(notificationLog).values({
        userId,
        type: 'reminder',
        channel: 'push',
      });

      await this.pushNotifications.sendToUser(userId, 'Legacy Made', message, {
        type: 'reminder',
      });
    });

    this.logger.debug(`Sent reminder to user ${userId}`);
  }
}
