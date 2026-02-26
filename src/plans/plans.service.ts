import pRetry from '@n8n/p-retry';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { plans, users } from '../schema';

@Injectable()
export class PlansService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  /**
   * Get the current user's plan, creating one if it doesn't exist.
   * Each user has exactly one plan.
   *
   * RLS policies ensure:
   * - User can only see their own plans
   * - User can only insert plans where userId matches their ID
   */
  async getOrCreate() {
    return this.db.rls(async (tx) => {
      // Try to find existing plan (RLS filters to current user's plans)
      const [existingPlan] = await tx.select().from(plans);

      if (existingPlan) {
        return existingPlan;
      }

      // Make sure user exists. If the user was recently created, the
      // webhook may not have been processed yet.
      const userCheck = async () => {
        // RLS policy on users table only allows seeing own record
        const [user] = await tx.select().from(users).limit(1);
        if (!user) {
          throw new Error('User not found');
        }
        return user;
      };

      await pRetry(userCheck, {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
      });

      // Create new plan for user (RLS validates userId matches current user)
      const [newPlan] = await tx.insert(plans).values({}).returning();

      return newPlan;
    });
  }
}
