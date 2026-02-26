import { Module } from '@nestjs/common';
import { TrustedContactsModule } from '../trusted-contacts/trusted-contacts.module';
import { AccessInvitationsController } from './access-invitations.controller';
import { AccessInvitationsService } from './access-invitations.service';
import { InvitationActionsService } from './invitation-actions.service';

@Module({
  imports: [TrustedContactsModule],
  providers: [AccessInvitationsService, InvitationActionsService],
  controllers: [AccessInvitationsController],
  exports: [InvitationActionsService],
})
export class AccessInvitationsModule {}
