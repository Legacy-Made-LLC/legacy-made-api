import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  providers: [PlansService],
  controllers: [PlansController],
})
export class PlansModule {}
