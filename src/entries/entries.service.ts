import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { entries, EntryCategory } from '../schema';
import { CreateEntryDto, UpdateEntryDto } from './dto';

@Injectable()
export class EntriesService {
  constructor(private readonly db: DbService) {}

  /**
   * Create a new entry.
   * RLS policy ensures user can only create entries in their own plans.
   */
  async create(createEntryDto: CreateEntryDto) {
    return this.db.rls(async (tx) => {
      const [entry] = await tx
        .insert(entries)
        .values(createEntryDto)
        .returning();
      return entry;
    });
  }

  /**
   * Find all entries for a plan.
   * RLS policy ensures only entries from user's plans are returned.
   */
  async findAll(planId: string) {
    return this.db.rls(async (tx) => {
      return tx.select().from(entries).where(eq(entries.planId, planId));
    });
  }

  /**
   * Find entries by category.
   * RLS policy ensures only entries from user's plans are returned.
   */
  async findByCategory(planId: string, category: EntryCategory) {
    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(entries)
        .where(and(eq(entries.planId, planId), eq(entries.category, category)));
    });
  }

  /**
   * Find a single entry by ID.
   * RLS policy ensures only entries from user's plans are visible.
   */
  async findOne(id: string) {
    return this.db.rls(async (tx) => {
      return this.findOneInTx(tx, id);
    });
  }

  /**
   * Internal: Find entry within an existing transaction.
   */
  private async findOneInTx(tx: DrizzleTransaction, id: string) {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, id));

    if (!entry) {
      throw new NotFoundException(`Entry with id ${id} not found`);
    }

    return entry;
  }

  /**
   * Update an entry.
   * RLS policy ensures user can only update entries in their own plans.
   */
  async update(id: string, updateEntryDto: UpdateEntryDto) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);

      // Merge metadata if provided
      const updatedMetadata = updateEntryDto.metadata
        ? { ...(existing.metadata as object), ...updateEntryDto.metadata }
        : existing.metadata;

      const [updated] = await tx
        .update(entries)
        .set({
          ...updateEntryDto,
          metadata: updatedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, id))
        .returning();

      return updated;
    });
  }

  /**
   * Delete an entry.
   * RLS policy ensures user can only delete entries in their own plans.
   */
  async remove(id: string) {
    return this.db.rls(async (tx) => {
      await this.findOneInTx(tx, id);
      await tx.delete(entries).where(eq(entries.id, id));
      return { deleted: true };
    });
  }
}
