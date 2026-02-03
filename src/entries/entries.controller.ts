import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  EntitlementsGuard,
  RequiresPillar,
  RequiresQuota,
  RequiresViewPillar,
} from '../entitlements';
import { CreateEntryDto, FindEntriesQueryDto, UpdateEntryDto } from './dto';
import { EntriesService } from './entries.service';

@Controller('plans/:planId/entries')
@UseGuards(EntitlementsGuard)
@RequiresViewPillar('important_info')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * Create a new entry in a plan.
   * POST /plans/:planId/entries
   *
   * Requires: important_info pillar access + entries quota
   */
  @Post()
  @RequiresPillar('important_info')
  @RequiresQuota('entries')
  create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() createEntryDto: CreateEntryDto,
  ) {
    return this.entriesService.create(planId, createEntryDto);
  }

  /**
   * Get all entries for a plan, optionally filtered by taskKey.
   * GET /plans/:planId/entries
   * GET /plans/:planId/entries?taskKey=some_task
   *
   * Requires: important_info pillar view access (class-level)
   */
  @Get()
  findAll(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: FindEntriesQueryDto,
  ) {
    return this.entriesService.findAll(planId, query);
  }

  /**
   * Get a single entry by ID.
   * GET /:id
   *
   * Requires: important_info pillar view access (class-level)
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.findOne(id);
  }

  /**
   * Update an entry.
   * PATCH /entries/:id
   *
   * Requires: important_info pillar access
   */
  @Patch(':id')
  @RequiresPillar('important_info')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEntryDto: UpdateEntryDto,
  ) {
    return this.entriesService.update(id, updateEntryDto);
  }

  /**
   * Delete an entry.
   * DELETE /entries/:id
   *
   * Requires: important_info pillar access
   */
  @Delete(':id')
  @RequiresPillar('important_info')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.remove(id);
  }
}
