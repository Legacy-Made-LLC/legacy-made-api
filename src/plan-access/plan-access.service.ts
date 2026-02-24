import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { AccessLevel, ApiClsStore, PlanAccessRole } from '../lib/types/cls';
import { plans, trustedContacts } from '../schema';

export interface PlanAccessContext {
  role: PlanAccessRole;
  accessLevel?: AccessLevel;
}

@Injectable()
export class PlanAccessService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

  /**
   * Determine the current user's access role for a given plan.
   *
   * Uses bypassRls because:
   * - The plans table RLS would filter out plans owned by others
   * - The trusted_contacts RLS only allows plan owners to query
   * - We need to check both ownership and trusted contact status
   *
   * Security: The query explicitly filters by the authenticated user's ID.
   */
  async getPlanAccess(planId: string): Promise<PlanAccessContext | null> {
    const userId = this.cls.get('userId');
    if (!userId) return null;

    return this.db.bypassRls(async (tx) => {
      // Check ownership first (fast path)
      const [ownedPlan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.id, planId), eq(plans.userId, userId)));

      if (ownedPlan) {
        return { role: 'owner' as const };
      }

      // Check trusted contact access
      const [contact] = await tx
        .select({ accessLevel: trustedContacts.accessLevel })
        .from(trustedContacts)
        .where(
          and(
            eq(trustedContacts.planId, planId),
            eq(trustedContacts.clerkUserId, userId),
            eq(trustedContacts.accessStatus, 'accepted'),
            eq(trustedContacts.accessTiming, 'immediate'),
          ),
        );

      if (contact) {
        return {
          role: 'trusted_contact' as const,
          accessLevel: contact.accessLevel as AccessLevel,
        };
      }

      return null;
    });
  }
}
