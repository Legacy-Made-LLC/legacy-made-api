import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { trustedContacts, users, plans, type TrustedContact } from '../schema';
import { InvitationTokenService } from '../trusted-contacts/invitation-token.service';

export interface InvitationDetails {
  id: string;
  planId: string;
  ownerName: string;
  accessLevel: string;
  accessTiming: string;
  accessStatus: string;
  contactEmail: string;
  contactFirstName: string;
  contactLastName: string;
}

@Injectable()
export class AccessInvitationsService {
  private readonly logger = new Logger(AccessInvitationsService.name);

  constructor(
    private readonly db: DbService,
    private readonly emailService: EmailService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Get invitation details from token (public endpoint, no auth required)
   */
  async getInvitationDetails(token: string): Promise<InvitationDetails> {
    // Verify and decode the token
    const payload = this.invitationTokenService.verifyToken(token);

    // Fetch invitation details using bypass RLS (public endpoint)
    return this.db.bypassRls(async (tx) => {
      const [result] = await tx
        .select({
          id: trustedContacts.id,
          planId: trustedContacts.planId,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
          accessLevel: trustedContacts.accessLevel,
          accessTiming: trustedContacts.accessTiming,
          accessStatus: trustedContacts.accessStatus,
          contactEmail: trustedContacts.email,
          contactFirstName: trustedContacts.firstName,
          contactLastName: trustedContacts.lastName,
        })
        .from(trustedContacts)
        .innerJoin(plans, eq(trustedContacts.planId, plans.id))
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(trustedContacts.id, payload.trustedContactId));

      if (!result) {
        throw new NotFoundException('Invitation not found');
      }

      // Verify email matches
      if (result.contactEmail !== payload.email) {
        throw new UnauthorizedException('Invalid invitation token');
      }

      return {
        id: result.id,
        planId: result.planId,
        ownerName: `${result.ownerFirstName} ${result.ownerLastName}`.trim(),
        accessLevel: result.accessLevel,
        accessTiming: result.accessTiming,
        accessStatus: result.accessStatus,
        contactEmail: result.contactEmail,
        contactFirstName: result.contactFirstName,
        contactLastName: result.contactLastName,
      };
    });
  }

  /**
   * Accept an invitation (authenticated endpoint)
   * Links the trusted contact to the current user's Clerk ID
   */
  async acceptInvitation(
    token: string,
    currentUserId: string,
  ): Promise<Omit<TrustedContact, 'notes'>> {
    // Verify token
    const payload = this.invitationTokenService.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      // Get the trusted contact
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.id, payload.trustedContactId));

      if (!trustedContact) {
        throw new NotFoundException('Invitation not found');
      }

      // Verify email matches
      if (trustedContact.email !== payload.email) {
        throw new UnauthorizedException('Invalid invitation token');
      }

      // Check status
      if (trustedContact.accessStatus !== 'pending') {
        throw new BadRequestException(
          `Invitation already ${trustedContact.accessStatus}`,
        );
      }

      // Update the trusted contact
      const [updated] = await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'accepted',
          acceptedAt: new Date(),
          clerkUserId: currentUserId,
        })
        .where(eq(trustedContacts.id, payload.trustedContactId))
        .returning();

      await this.activityLog.log(tx, {
        planId: trustedContact.planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
        details: { statusChange: 'accepted' },
      });

      this.logger.log(
        `Invitation accepted for trusted contact ${payload.trustedContactId}`,
      );

      // Notify plan owner if we have their email
      const [owner] = await tx
        .select({
          email: users.email,
          firstName: users.firstName,
        })
        .from(plans)
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(plans.id, trustedContact.planId));

      if (owner?.email) {
        try {
          const contactName =
            `${trustedContact.firstName} ${trustedContact.lastName}`.trim();
          await this.emailService.sendAccessAccepted({
            to: owner.email,
            ownerFirstName: owner.firstName ?? 'there',
            contactName,
            accessLevel: trustedContact.accessLevel,
            acceptedAt: new Date(),
          });
        } catch (error) {
          this.logger.error(
            'Failed to send owner acceptance notification',
            error,
          );
        }
      }

      // Exclude owner's private notes from response to trusted contact
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { notes: _notes, ...withoutNotes } = updated;
      return withoutNotes;
    });
  }

  /**
   * Decline an invitation (can be done before or after login)
   */
  async declineInvitation(token: string): Promise<void> {
    const payload = this.invitationTokenService.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.id, payload.trustedContactId));

      if (!trustedContact) {
        throw new NotFoundException('Invitation not found');
      }

      if (trustedContact.email !== payload.email) {
        throw new UnauthorizedException('Invalid invitation token');
      }

      if (trustedContact.accessStatus !== 'pending') {
        throw new BadRequestException(
          `Cannot decline - invitation is already ${trustedContact.accessStatus}`,
        );
      }

      // Update status
      await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'declined',
          declinedAt: new Date(),
        })
        .where(eq(trustedContacts.id, payload.trustedContactId));

      await this.activityLog.log(tx, {
        planId: trustedContact.planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
        details: { statusChange: 'declined' },
      });

      this.logger.log(
        `Invitation declined for trusted contact ${payload.trustedContactId}`,
      );

      // Notify plan owner if we have their email
      const [owner] = await tx
        .select({
          email: users.email,
          firstName: users.firstName,
        })
        .from(plans)
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(plans.id, trustedContact.planId));

      if (owner?.email) {
        try {
          const contactName =
            `${trustedContact.firstName} ${trustedContact.lastName}`.trim();
          await this.emailService.sendAccessDeclined({
            to: owner.email,
            ownerFirstName: owner.firstName ?? 'there',
            contactName,
            declinedAt: new Date(),
          });
        } catch (error) {
          this.logger.error('Failed to send owner decline notification', error);
        }
      }
    });
  }

  /**
   * Self-revoke access (authenticated endpoint)
   * Trusted contact removes their own access to a plan
   */
  async revokeOwnAccess(planId: string, currentUserId: string): Promise<void> {
    return this.db.bypassRls(async (tx) => {
      // Find the trusted contact record for this user and plan
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(
          and(
            eq(trustedContacts.planId, planId),
            eq(trustedContacts.clerkUserId, currentUserId),
          ),
        );

      if (!trustedContact) {
        throw new NotFoundException(
          'You do not have access to this plan or access was already revoked',
        );
      }

      if (trustedContact.accessStatus !== 'accepted') {
        throw new BadRequestException('Can only revoke accepted access');
      }

      // Update status
      await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'revoked_by_contact',
          revokedAt: new Date(),
        })
        .where(eq(trustedContacts.id, trustedContact.id));

      await this.activityLog.log(tx, {
        planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
        details: { statusChange: 'revoked_by_contact' },
      });

      this.logger.log(
        `User ${currentUserId} revoked their own access to plan ${planId}`,
      );

      // Notify plan owner if we have their email
      const [owner] = await tx
        .select({
          email: users.email,
          firstName: users.firstName,
        })
        .from(plans)
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(plans.id, planId));

      if (owner?.email) {
        try {
          const contactName =
            `${trustedContact.firstName} ${trustedContact.lastName}`.trim();
          await this.emailService.sendAccessRevokedByContact({
            to: owner.email,
            ownerFirstName: owner.firstName ?? 'there',
            contactName,
            revokedAt: new Date(),
          });
        } catch (error) {
          this.logger.error('Failed to send owner revoke notification', error);
        }
      }
    });
  }
}
