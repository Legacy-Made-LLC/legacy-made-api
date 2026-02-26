import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
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

  /**
   * Accept a pending invitation.
   * POST /shared-plans/:planId/accept
   */
  @Post(':planId/accept')
  accept(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.sharedPlansService.acceptInvitation(planId);
  }

  /**
   * Decline a pending invitation.
   * POST /shared-plans/:planId/decline
   */
  @Post(':planId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.sharedPlansService.declineInvitation(planId);
  }
}
