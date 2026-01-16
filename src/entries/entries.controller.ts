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
import { ZodValidationPipe } from 'nestjs-zod';
import { type EntryCategory } from '../schema';
import {
  type CreateEntryDto,
  createEntrySchema,
  type UpdateEntryDto,
  updateEntrySchema,
} from './dto';
import { EntriesService } from './entries.service';

@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createEntrySchema))
    createEntryDto: CreateEntryDto,
  ) {
    return this.entriesService.create(createEntryDto);
  }

  @Get()
  findAll(
    @Query('planId', ParseUUIDPipe) planId: string,
    @Query('category') category?: EntryCategory,
  ) {
    if (category) {
      return this.entriesService.findByCategory(planId, category);
    }
    return this.entriesService.findAll(planId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEntrySchema))
    updateEntryDto: UpdateEntryDto,
  ) {
    return this.entriesService.update(id, updateEntryDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.remove(id);
  }
}
