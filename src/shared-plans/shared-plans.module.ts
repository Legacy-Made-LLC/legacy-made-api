import { Module } from '@nestjs/common';
import { AccessInvitationsModule } from '../access-invitations/access-invitations.module';
import { SharedPlansController } from './shared-plans.controller';
import { SharedPlansService } from './shared-plans.service';

@Module({
  imports: [AccessInvitationsModule],
  providers: [SharedPlansService],
  controllers: [SharedPlansController],
})
export class SharedPlansModule {}
