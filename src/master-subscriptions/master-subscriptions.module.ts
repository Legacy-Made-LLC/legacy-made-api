import { Module } from '@nestjs/common';
import { MasterSubscriptionInvitationsController } from './master-subscription-invitations.controller';
import { MasterSubInvitationTokenService } from './master-subscription-invitation-token.service';
import { MasterSubscriptionsLapseService } from './master-subscriptions-lapse.service';
import { MasterSubscriptionsService } from './master-subscriptions.service';

@Module({
  providers: [
    MasterSubscriptionsService,
    MasterSubInvitationTokenService,
    MasterSubscriptionsLapseService,
  ],
  controllers: [MasterSubscriptionInvitationsController],
  exports: [MasterSubscriptionsService, MasterSubInvitationTokenService],
})
export class MasterSubscriptionsModule {}
