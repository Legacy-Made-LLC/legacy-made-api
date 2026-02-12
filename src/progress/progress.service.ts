import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { progress } from '../schema';
import { UpsertProgressDto } from './dto';

@Injectable()
export class ProgressService {
  constructor(private readonly db: DbService) {}

  /**
   * Create or update a progress record for a (planId, key) pair.
   * RLS policy ensures user can only upsert progress in their own plans.
   */
  async upsert(planId: string, key: string, dto: UpsertProgressDto) {
    return this.db.rls(async (tx) => {
      const [result] = await tx
        .insert(progress)
        .values({ planId, key, data: dto.data })
        .onConflictDoUpdate({
          target: [progress.planId, progress.key],
          set: { data: dto.data, updatedAt: new Date() },
        })
        .returning();
      return result;
    });
  }

  /**
   * Find all progress records for a plan.
   * RLS policy ensures only progress from user's plans is returned.
   */
  async findAll(planId: string) {
    return this.db.rls(async (tx) => {
      return tx.select().from(progress).where(eq(progress.planId, planId));
    });
  }

  /**
   * Find a single progress record by planId and key.
   * RLS policy ensures only progress from user's plans is visible.
   */
  async findOne(planId: string, key: string) {
    return this.db.rls(async (tx) => {
      const [record] = await tx
        .select()
        .from(progress)
        .where(and(eq(progress.planId, planId), eq(progress.key, key)));

      if (!record) {
        throw new NotFoundException(
          `Progress with key '${key}' not found for plan ${planId}`,
        );
      }

      return record;
    });
  }

  /**
   * Delete a progress record by planId and key.
   * RLS policy ensures user can only delete progress in their own plans.
   */
  async remove(planId: string, key: string) {
    return this.db.rls(async (tx) => {
      const [deleted] = await tx
        .delete(progress)
        .where(and(eq(progress.planId, planId), eq(progress.key, key)))
        .returning();

      if (!deleted) {
        throw new NotFoundException(
          `Progress with key '${key}' not found for plan ${planId}`,
        );
      }

      return { deleted: true };
    });
  }
}
