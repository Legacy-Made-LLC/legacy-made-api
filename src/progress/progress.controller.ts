import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ParseKeyPipe } from '../common/parse-key.pipe';
import {
  PlanAccessGuard,
  RequiresAccessLevel,
} from '../plan-access/plan-access.guard';
import { UpsertProgressDto } from './dto';
import { ProgressService } from './progress.service';

// No EntitlementsGuard — progress is cross-cutting UI state, not a gated pillar.
// PlanAccessGuard handles both owner and trusted contact access.
@Controller('plans/:planId/progress')
@UseGuards(PlanAccessGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * Create or update a progress record.
   * PUT /plans/:planId/progress/:key
   */
  @Put(':key')
  @RequiresAccessLevel('full_edit')
  upsert(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('key', ParseKeyPipe) key: string,
    @Body() dto: UpsertProgressDto,
  ) {
    return this.progressService.upsert(planId, key, dto);
  }

  /**
   * Get all progress records for a plan.
   * GET /plans/:planId/progress
   */
  @Get()
  findAll(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.progressService.findAll(planId);
  }

  /**
   * Get a single progress record by key.
   * GET /plans/:planId/progress/:key
   */
  @Get(':key')
  findOne(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('key', ParseKeyPipe) key: string,
  ) {
    return this.progressService.findOne(planId, key);
  }

  /**
   * Delete a progress record.
   * DELETE /plans/:planId/progress/:key
   */
  @Delete(':key')
  @RequiresAccessLevel('full_edit')
  remove(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('key', ParseKeyPipe) key: string,
  ) {
    return this.progressService.remove(planId, key);
  }
}
