import { Module } from '@nestjs/common';
import { TrustedContactsModule } from '../trusted-contacts/trusted-contacts.module';
import { AccessInvitationsController } from './access-invitations.controller';
import { AccessInvitationsService } from './access-invitations.service';

@Module({
  imports: [TrustedContactsModule],
  providers: [AccessInvitationsService],
  controllers: [AccessInvitationsController],
})
export class AccessInvitationsModule {}
