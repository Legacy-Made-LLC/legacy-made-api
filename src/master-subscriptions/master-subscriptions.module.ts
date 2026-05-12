import { Module } from '@nestjs/common';
import { MasterSubscriptionsService } from './master-subscriptions.service';

@Module({
  providers: [MasterSubscriptionsService],
  exports: [MasterSubscriptionsService],
})
export class MasterSubscriptionsModule {}
