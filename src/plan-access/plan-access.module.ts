import { Global, Module } from '@nestjs/common';
import { PlanAccessGuard } from './plan-access.guard';
import { PlanAccessService } from './plan-access.service';

@Global()
@Module({
  providers: [PlanAccessService, PlanAccessGuard],
  exports: [PlanAccessService, PlanAccessGuard],
})
export class PlanAccessModule {}
