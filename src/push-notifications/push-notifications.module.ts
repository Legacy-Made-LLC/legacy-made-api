import { Global, Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Global()
@Module({
  providers: [PushNotificationsService, ReminderSchedulerService],
  controllers: [PushNotificationsController],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
