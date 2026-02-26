import { Controller, Get, UseGuards } from '@nestjs/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EntitlementInfo } from '../entitlements/entitlements.types';
import { PlanAccessGuard } from '../plan-access/plan-access.guard';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  /**
   * Get the current user's plan, creating one if it doesn't exist.
   */
  @Get('me')
  getMyPlan() {
    return this.plansService.getOrCreate();
  }

  /**
   * Get the entitlements that apply to this plan.
   *
   * For the plan owner, returns their own entitlements.
   * For a trusted contact, returns the plan owner's entitlements
   * (since the owner's tier determines what's available on the plan).
   */
  @Get(':planId/entitlements')
  @UseGuards(PlanAccessGuard)
  getPlanEntitlements(): Promise<EntitlementInfo> {
    return this.entitlementsService.getEntitlementInfo();
  }
}
