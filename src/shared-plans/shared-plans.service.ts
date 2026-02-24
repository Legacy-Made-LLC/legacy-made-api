import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { ApiClsStore } from '../lib/types/cls';
import { plans, trustedContacts, users } from '../schema';

@Injectable()
export class SharedPlansService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

  /**
   * List all plans shared with the current user.
   *
   * Uses bypassRls because the query needs to cross RLS boundaries:
   * - trusted_contacts RLS only allows plan owners
   * - plans/users RLS only allows own records
   *
   * Security: Explicitly filters by the authenticated user's clerk_user_id.
   */
  async findAll() {
    const userId = this.cls.get('userId');

    return this.db.bypassRls(async (tx) => {
      return tx
        .select({
          planId: plans.id,
          planName: plans.name,
          planType: plans.planType,
          forName: plans.forName,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
          ownerAvatarUrl: users.avatarUrl,
          accessLevel: trustedContacts.accessLevel,
          accessTiming: trustedContacts.accessTiming,
          acceptedAt: trustedContacts.acceptedAt,
        })
        .from(trustedContacts)
        .innerJoin(plans, eq(plans.id, trustedContacts.planId))
        .innerJoin(users, eq(users.id, plans.userId))
        .where(
          and(
            eq(trustedContacts.clerkUserId, userId!),
            eq(trustedContacts.accessStatus, 'accepted'),
            eq(trustedContacts.accessTiming, 'immediate'),
          ),
        )
        .orderBy(trustedContacts.acceptedAt);
    });
  }

  /**
   * Get details of a specific shared plan including the user's access level.
   */
  async findOne(planId: string) {
    const userId = this.cls.get('userId');

    const result = await this.db.bypassRls(async (tx) => {
      const [row] = await tx
        .select({
          planId: plans.id,
          planName: plans.name,
          planType: plans.planType,
          forName: plans.forName,
          planCreatedAt: plans.createdAt,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
          ownerAvatarUrl: users.avatarUrl,
          accessLevel: trustedContacts.accessLevel,
          accessTiming: trustedContacts.accessTiming,
          acceptedAt: trustedContacts.acceptedAt,
        })
        .from(trustedContacts)
        .innerJoin(plans, eq(plans.id, trustedContacts.planId))
        .innerJoin(users, eq(users.id, plans.userId))
        .where(
          and(
            eq(trustedContacts.planId, planId),
            eq(trustedContacts.clerkUserId, userId!),
            eq(trustedContacts.accessStatus, 'accepted'),
            eq(trustedContacts.accessTiming, 'immediate'),
          ),
        );

      return row;
    });

    if (!result) {
      throw new NotFoundException('Shared plan not found');
    }

    return result;
  }
}
