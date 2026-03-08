import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { ApiClsService } from '../lib/api-cls.service';
import {
  plans,
  trustedContacts,
  users,
  encryptedDeks,
  type TrustedContact,
} from '../schema';
import {
  InvitationTokenPayload,
  InvitationTokenService,
} from '../trusted-contacts/invitation-token.service';
import { InvitationActionsService } from './invitation-actions.service';

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
    private readonly cls: ApiClsService,
    private readonly emailService: EmailService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly activityLog: ActivityLogService,
    private readonly invitationActions: InvitationActionsService,
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
   *
   * NOTE: We intentionally do NOT verify that the accepting user's email
   * matches the invitation email. This allows a user to accept with a
   * different sign-in email than the one the plan owner invited, avoiding
   * confusion about mismatched emails.
   */
  async acceptInvitation(
    token: string,
  ): Promise<Omit<TrustedContact, 'notes'>> {
    const currentUserId = this.cls.requireUserId();
    // Verify token
    const payload = this.invitationTokenService.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      const trustedContact = await this.findAndValidatePendingContact(
        tx,
        payload,
      );
      return this.invitationActions.performAccept(
        tx,
        trustedContact,
        currentUserId,
      );
    });
  }

  /**
   * Decline an invitation (can be done before or after login)
   */
  async declineInvitation(token: string): Promise<void> {
    const payload = this.invitationTokenService.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      const trustedContact = await this.findAndValidatePendingContact(
        tx,
        payload,
      );
      return this.invitationActions.performDecline(tx, trustedContact);
    });
  }

  /**
   * Self-revoke access (authenticated endpoint)
   * Trusted contact removes their own access to a plan
   */
  async revokeOwnAccess(planId: string): Promise<void> {
    const currentUserId = this.cls.requireUserId();
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

      // Delete own DEK copies where I am the recipient for this plan
      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.recipientId, currentUserId),
            eq(encryptedDeks.dekType, 'contact'),
            eq(encryptedDeks.planId, planId),
          ),
        );

      await this.activityLog.log(tx, {
        planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
        details: { statusChange: 'revoked_by_contact', dekCopyDeleted: true },
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

  /**
   * Look up a trusted contact by token payload and validate it is pending.
   */
  private async findAndValidatePendingContact(
    tx: DrizzleTransaction,
    payload: InvitationTokenPayload,
  ): Promise<TrustedContact> {
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
        `Invitation already ${trustedContact.accessStatus}`,
      );
    }

    return trustedContact;
  }
}
