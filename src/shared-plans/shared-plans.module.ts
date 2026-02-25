import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { EmailModule } from '../email/email.module';
import { SharedPlansController } from './shared-plans.controller';
import { SharedPlansService } from './shared-plans.service';

@Module({
  imports: [ActivityLogModule, EmailModule],
  providers: [SharedPlansService],
  controllers: [SharedPlansController],
})
export class SharedPlansModule {}
