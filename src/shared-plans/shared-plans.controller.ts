import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SharedPlansService } from './shared-plans.service';

@Controller('shared-plans')
export class SharedPlansController {
  constructor(private readonly sharedPlansService: SharedPlansService) {}

  /**
   * List all plans shared with the current user.
   * GET /shared-plans
   *
   * Returns plan metadata + owner info + the user's access level.
   */
  @Get()
  findAll() {
    return this.sharedPlansService.findAll();
  }

  /**
   * Get details of a specific shared plan.
   * GET /shared-plans/:planId
   *
   * Returns plan metadata + owner info + the user's access level.
   */
  @Get(':planId')
  findOne(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.sharedPlansService.findOne(planId);
  }
}
