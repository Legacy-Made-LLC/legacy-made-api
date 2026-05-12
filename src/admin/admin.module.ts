import { Module } from '@nestjs/common';
import { MasterSubscriptionsModule } from '../master-subscriptions/master-subscriptions.module';
import { AdminMasterSubscriptionMembersController } from './admin-master-subscription-members.controller';
import { AdminMasterSubscriptionsController } from './admin-master-subscriptions.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemAdminGuard } from './system-admin.guard';

@Module({
  imports: [MasterSubscriptionsModule],
  providers: [AdminService, SystemAdminGuard],
  controllers: [
    AdminController,
    AdminMasterSubscriptionsController,
    AdminMasterSubscriptionMembersController,
  ],
  exports: [AdminService, SystemAdminGuard],
})
export class AdminModule {}
