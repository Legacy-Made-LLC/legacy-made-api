import { Module } from '@nestjs/common';
import { SharedPlansService } from './shared-plans.service';
import { SharedPlansController } from './shared-plans.controller';

@Module({
  providers: [SharedPlansService],
  controllers: [SharedPlansController],
})
export class SharedPlansModule {}
