import { Controller, Get } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Get the current user's plan, creating one if it doesn't exist.
   */
  @Get('me')
  getMyPlan() {
    return this.plansService.getOrCreate();
  }
}
