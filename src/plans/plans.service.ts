import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { ApiClsStore } from '../lib/types/cls';
import { plans } from '../schema';

@Injectable()
export class PlansService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

  /**
   * Get the current user's plan, creating one if it doesn't exist.
   * Each user has exactly one plan.
   */
  async getOrCreate() {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Try to find existing plan
    const [existingPlan] = await this.db.drizzle
      .select()
      .from(plans)
      .where(eq(plans.userId, userId));

    if (existingPlan) {
      return existingPlan;
    }

    // Create new plan for user
    const [newPlan] = await this.db.drizzle
      .insert(plans)
      .values({ userId })
      .returning();

    return newPlan;
  }
}
