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
} from '@nestjs/common';
import { CreateEntryDto, FindEntriesQueryDto, UpdateEntryDto } from './dto';
import { EntriesService } from './entries.service';

@Controller('plans/:planId/entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * Create a new entry in a plan.
   * POST /plans/:planId/entries
   */
  @Post()
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
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.findOne(id);
  }

  /**
   * Update an entry.
   * PATCH /entries/:id
   */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEntryDto: UpdateEntryDto,
  ) {
    return this.entriesService.update(id, updateEntryDto);
  }

  /**
   * Delete an entry.
   * DELETE /entries/:id
   */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.remove(id);
  }
}
