import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { entries, EntryCategory } from '../schema';
import { CreateEntryDto, UpdateEntryDto } from './dto';

@Injectable()
export class EntriesService {
  constructor(private readonly db: DbService) {}

  async create(createEntryDto: CreateEntryDto) {
    const [entry] = await this.db.drizzle
      .insert(entries)
      .values(createEntryDto)
      .returning();

    return entry;
  }

  async findAll(planId: string) {
    return this.db.drizzle
      .select()
      .from(entries)
      .where(eq(entries.planId, planId));
  }

  async findByCategory(planId: string, category: EntryCategory) {
    return this.db.drizzle
      .select()
      .from(entries)
      .where(and(eq(entries.planId, planId), eq(entries.category, category)));
  }

  async findOne(id: string) {
    const [entry] = await this.db.drizzle
      .select()
      .from(entries)
      .where(eq(entries.id, id));

    if (!entry) {
      throw new NotFoundException(`Entry with id ${id} not found`);
    }

    return entry;
  }

  async update(id: string, updateEntryDto: UpdateEntryDto) {
    const existing = await this.findOne(id);

    // Merge metadata if provided
    const updatedMetadata = updateEntryDto.metadata
      ? { ...(existing.metadata as object), ...updateEntryDto.metadata }
      : existing.metadata;

    const [updated] = await this.db.drizzle
      .update(entries)
      .set({ ...updateEntryDto, metadata: updatedMetadata })
      .where(eq(entries.id, id))
      .returning();

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.db.drizzle.delete(entries).where(eq(entries.id, id));

    return { deleted: true };
  }
}
