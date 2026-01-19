import pRetry from '@n8n/p-retry';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { ApiClsStore } from '../lib/types/cls';
import { plans, users } from '../schema';

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

    // Make sure user exists. If the user was recently created, the
    // webhook may not have been processed yet.
    const userCheck = async () => {
      const [user] = await this.db.drizzle
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    };

    pRetry(userCheck, {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
    });

    // Create new plan for user
    const [newPlan] = await this.db.drizzle
      .insert(plans)
      .values({ userId })
      .returning();

    return newPlan;
  }
}
