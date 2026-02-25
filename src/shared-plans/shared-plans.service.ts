import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { ApiClsService } from '../lib/api-cls.service';
import { AccessLevel } from '../lib/types/cls';
import { getPermissionsForAccessLevel } from '../plan-access/plan-permissions';
import { plans, trustedContacts, type TrustedContact, users } from '../schema';

@Injectable()
export class SharedPlansService {
  private readonly logger = new Logger(SharedPlansService.name);

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
    private readonly activityLog: ActivityLogService,
    private readonly emailService: EmailService,
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
    const userId = this.cls.requireUserId();

    return this.db.bypassRls(async (tx) => {
      const userEmail = await this.getUserEmail(tx, userId);

      const rows = await tx
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
          accessStatus: trustedContacts.accessStatus,
          acceptedAt: trustedContacts.acceptedAt,
        })
        .from(trustedContacts)
        .innerJoin(plans, eq(plans.id, trustedContacts.planId))
        .innerJoin(users, eq(users.id, plans.userId))
        .where(
          and(
            eq(trustedContacts.accessTiming, 'immediate'),
            or(
              and(
                eq(trustedContacts.clerkUserId, userId),
                eq(trustedContacts.accessStatus, 'accepted'),
              ),
              ...(userEmail
                ? [
                    and(
                      eq(trustedContacts.email, userEmail),
                      eq(trustedContacts.accessStatus, 'pending'),
                    ),
                  ]
                : []),
            ),
          ),
        )
        .orderBy(trustedContacts.acceptedAt);

      return rows.map((row) => ({
        ...row,
        permissions: getPermissionsForAccessLevel(
          row.accessLevel as AccessLevel,
        ),
      }));
    });
  }

  /**
   * Get details of a specific shared plan including the user's access level.
   */
  async findOne(planId: string) {
    const userId = this.cls.requireUserId();

    const result = await this.db.bypassRls(async (tx) => {
      const userEmail = await this.getUserEmail(tx, userId);

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
          accessStatus: trustedContacts.accessStatus,
          acceptedAt: trustedContacts.acceptedAt,
        })
        .from(trustedContacts)
        .innerJoin(plans, eq(plans.id, trustedContacts.planId))
        .innerJoin(users, eq(users.id, plans.userId))
        .where(
          and(
            eq(trustedContacts.planId, planId),
            eq(trustedContacts.accessTiming, 'immediate'),
            or(
              and(
                eq(trustedContacts.clerkUserId, userId),
                eq(trustedContacts.accessStatus, 'accepted'),
              ),
              ...(userEmail
                ? [
                    and(
                      eq(trustedContacts.email, userEmail),
                      eq(trustedContacts.accessStatus, 'pending'),
                    ),
                  ]
                : []),
            ),
          ),
        );

      return row;
    });

    if (!result) {
      throw new NotFoundException('Shared plan not found');
    }

    return {
      ...result,
      permissions: getPermissionsForAccessLevel(
        result.accessLevel as AccessLevel,
      ),
    };
  }

  /**
   * Accept a pending invitation for the current user.
   * Matches by plan ID + current user's email.
   */
  async acceptInvitation(planId: string) {
    const userId = this.cls.requireUserId();

    return this.db.bypassRls(async (tx) => {
      const trustedContact = await this.findPendingInvitation(
        tx,
        planId,
        userId,
      );

      const [updated] = await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'accepted',
          acceptedAt: new Date(),
          clerkUserId: userId,
        })
        .where(eq(trustedContacts.id, trustedContact.id))
        .returning();

      await this.logAndNotifyOwner(tx, trustedContact, 'accepted');

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { notes: _notes, ...withoutNotes } = updated;
      return withoutNotes;
    });
  }

  /**
   * Decline a pending invitation for the current user.
   * Matches by plan ID + current user's email.
   */
  async declineInvitation(planId: string) {
    const userId = this.cls.requireUserId();

    return this.db.bypassRls(async (tx) => {
      const trustedContact = await this.findPendingInvitation(
        tx,
        planId,
        userId,
      );

      await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'declined',
          declinedAt: new Date(),
        })
        .where(eq(trustedContacts.id, trustedContact.id));

      await this.logAndNotifyOwner(tx, trustedContact, 'declined');
    });
  }

  private async logAndNotifyOwner(
    tx: Parameters<Parameters<DbService['bypassRls']>[0]>[0],
    trustedContact: TrustedContact,
    statusChange: 'accepted' | 'declined',
  ) {
    await this.activityLog.log(tx, {
      planId: trustedContact.planId,
      action: 'updated',
      resourceType: 'trusted_contact',
      resourceId: trustedContact.id,
      details: { statusChange },
    });

    this.logger.log(
      `Invitation ${statusChange} for trusted contact ${trustedContact.id} via shared-plans`,
    );

    const [owner] = await tx
      .select({ email: users.email, firstName: users.firstName })
      .from(plans)
      .innerJoin(users, eq(plans.userId, users.id))
      .where(eq(plans.id, trustedContact.planId));

    if (owner?.email) {
      const contactName =
        `${trustedContact.firstName} ${trustedContact.lastName}`.trim();
      try {
        if (statusChange === 'accepted') {
          await this.emailService.sendAccessAccepted({
            to: owner.email,
            ownerFirstName: owner.firstName ?? 'there',
            contactName,
            accessLevel: trustedContact.accessLevel,
            acceptedAt: new Date(),
          });
        } else {
          await this.emailService.sendAccessDeclined({
            to: owner.email,
            ownerFirstName: owner.firstName ?? 'there',
            contactName,
            declinedAt: new Date(),
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to send owner ${statusChange} notification`,
          error,
        );
      }
    }
  }

  /**
   * Find a pending invitation for the given plan matching the current user's email.
   */
  private async findPendingInvitation(
    tx: Parameters<Parameters<DbService['bypassRls']>[0]>[0],
    planId: string,
    userId: string,
  ) {
    const userEmail = await this.getUserEmail(tx, userId);
    if (!userEmail) {
      throw new NotFoundException('Invitation not found');
    }

    const [trustedContact] = await tx
      .select()
      .from(trustedContacts)
      .where(
        and(
          eq(trustedContacts.planId, planId),
          eq(trustedContacts.email, userEmail),
          eq(trustedContacts.accessStatus, 'pending'),
        ),
      );

    if (!trustedContact) {
      throw new NotFoundException('Invitation not found');
    }

    return trustedContact;
  }

  private async getUserEmail(
    tx: Parameters<Parameters<DbService['bypassRls']>[0]>[0],
    userId: string,
  ): Promise<string | null> {
    const [user] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    return user?.email ?? null;
  }
}
