import { Module } from '@nestjs/common';
import { InvitationTokenService } from './invitation-token.service';
import { TrustedContactsController } from './trusted-contacts.controller';
import { TrustedContactsService } from './trusted-contacts.service';

@Module({
  providers: [TrustedContactsService, InvitationTokenService],
  controllers: [TrustedContactsController],
  exports: [InvitationTokenService],
})
export class TrustedContactsModule {}
