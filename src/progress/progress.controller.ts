import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { UpsertProgressDto } from './dto';
import { ProgressService } from './progress.service';

@Controller('plans/:planId/progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * Create or update a progress record.
   * PUT /plans/:planId/progress/:key
   */
  @Put(':key')
  upsert(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('key') key: string,
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
    @Param('key') key: string,
  ) {
    return this.progressService.findOne(planId, key);
  }

  /**
   * Delete a progress record.
   * DELETE /plans/:planId/progress/:key
   */
  @Delete(':key')
  remove(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('key') key: string,
  ) {
    return this.progressService.remove(planId, key);
  }
}
