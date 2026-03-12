import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApiConfigService } from '../config/api-config.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { AccessLevel } from '../lib/types/cls';
import {
  trustedContacts,
  users,
  plans,
  encryptedDeks,
  type TrustedContact,
} from '../schema';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { InvitationTokenService } from './invitation-token.service';

@Injectable()
export class TrustedContactsService {
  private readonly logger = new Logger(TrustedContactsService.name);

  private readonly invitationBaseUrl: string;

  constructor(
    private readonly db: DbService,
    private readonly emailService: EmailService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ApiConfigService,
  ) {
    this.invitationBaseUrl = this.config.get('INVITATION_BASE_URL');
  }

  /**
   * Create a new trusted contact and send invitation email
   */
  async create(
    planId: string,
    dto: CreateTrustedContactDto,
  ): Promise<TrustedContact> {
    return this.db.rls(async (tx) => {
      // Check if a trusted contact with this email already exists for this plan
      const [existing] = await tx
        .select()
        .from(trustedContacts)
        .where(
          and(
            eq(trustedContacts.planId, planId),
            eq(trustedContacts.email, dto.email),
          ),
        );

      let trustedContact: TrustedContact;

      if (existing) {
        // If already pending or accepted, reject
        if (
          existing.accessStatus === 'pending' ||
          existing.accessStatus === 'accepted'
        ) {
          throw new BadRequestException(
            `A trusted contact with this email already exists (status: ${existing.accessStatus})`,
          );
        }

        // Re-invite: update the existing record with new values, reset status
        const [updated] = await tx
          .update(trustedContacts)
          .set({
            ...dto,
            accessStatus: 'pending',
            acceptedAt: null,
            declinedAt: null,
            revokedAt: null,
          })
          .where(eq(trustedContacts.id, existing.id))
          .returning();

        trustedContact = updated;
      } else {
        // Insert new trusted contact
        const [inserted] = await tx
          .insert(trustedContacts)
          .values({
            planId,
            ...dto,
            accessStatus: 'pending',
          })
          .returning();

        trustedContact = inserted;
      }

      // Get plan owner information for the email
      const [plan] = await tx
        .select({
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(plans)
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(plans.id, planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      const ownerName = `${plan.ownerFirstName} ${plan.ownerLastName}`.trim();

      // Generate invitation token
      const invitationToken = this.invitationTokenService.generateToken({
        trustedContactId: trustedContact.id,
        planId: trustedContact.planId,
        email: trustedContact.email,
      });

      const invitationUrl = `${this.invitationBaseUrl}/invitations/${invitationToken}`;

      // Send invitation email
      try {
        await this.emailService.sendInvitation({
          to: trustedContact.email,
          contactFirstName: trustedContact.firstName,
          ownerName,
          accessLevel: trustedContact.accessLevel as AccessLevel,
          accessTiming: trustedContact.accessTiming as
            | 'immediate'
            | 'upon_passing',
          invitationUrl,
        });

        this.logger.log(
          `Invitation sent to ${trustedContact.email} for plan ${planId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send invitation email to ${trustedContact.email}`,
          error,
        );
        // We don't throw here - the contact was created, email can be resent
      }

      await this.activityLog.log(tx, {
        planId,
        action: existing ? 'updated' : 'created',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
        details: existing
          ? { statusChange: 'pending', reinvited: true }
          : undefined,
      });

      return trustedContact;
    });
  }

  /**
   * Get all trusted contacts for a plan, with dekShared status.
   */
  async findAll(planId: string) {
    return this.db.rls(async (tx) => {
      const contacts = await tx
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.planId, planId))
        .orderBy(trustedContacts.createdAt);

      // Batch-check which contacts have a DEK copy shared with them
      const dekCopies = await tx
        .select({ recipientId: encryptedDeks.recipientId })
        .from(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.planId, planId),
            eq(encryptedDeks.dekType, 'contact'),
          ),
        );

      const recipientsWithDek = new Set(dekCopies.map((d) => d.recipientId));

      return contacts.map((contact) => ({
        ...contact,
        dekShared: contact.clerkUserId
          ? recipientsWithDek.has(contact.clerkUserId)
          : false,
      }));
    });
  }

  /**
   * Get a specific trusted contact, with dekShared status.
   */
  async findOne(id: string, planId: string) {
    return this.db.rls(async (tx) => {
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(
          and(eq(trustedContacts.id, id), eq(trustedContacts.planId, planId)),
        );

      if (!trustedContact) {
        throw new NotFoundException('Trusted contact not found');
      }

      let dekShared = false;
      if (trustedContact.clerkUserId) {
        const [dekCopy] = await tx
          .select({ id: encryptedDeks.id })
          .from(encryptedDeks)
          .where(
            and(
              eq(encryptedDeks.planId, planId),
              eq(encryptedDeks.recipientId, trustedContact.clerkUserId),
              eq(encryptedDeks.dekType, 'contact'),
            ),
          )
          .limit(1);
        dekShared = !!dekCopy;
      }

      return { ...trustedContact, dekShared };
    });
  }

  /**
   * Update a trusted contact
   * Cannot change email or clerk_user_id once set
   */
  async update(
    id: string,
    planId: string,
    dto: UpdateTrustedContactDto,
  ): Promise<TrustedContact> {
    return this.db.rls(async (tx) => {
      const [updated] = await tx
        .update(trustedContacts)
        .set(dto)
        .where(
          and(eq(trustedContacts.id, id), eq(trustedContacts.planId, planId)),
        )
        .returning();

      if (!updated) {
        throw new NotFoundException('Trusted contact not found');
      }

      await this.activityLog.log(tx, {
        planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: id,
      });

      this.logger.log(`Updated trusted contact ${id} for plan ${planId}`);
      return updated;
    });
  }

  /**
   * Revoke access (soft delete - sets status to revoked_by_owner)
   */
  async remove(id: string, planId: string): Promise<void> {
    return this.db.rls(async (tx) => {
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(
          and(eq(trustedContacts.id, id), eq(trustedContacts.planId, planId)),
        );

      if (!trustedContact) {
        throw new NotFoundException('Trusted contact not found');
      }

      await tx
        .update(trustedContacts)
        .set({
          accessStatus: 'revoked_by_owner',
          revokedAt: new Date(),
        })
        .where(eq(trustedContacts.id, id));

      // Delete the contact's encrypted DEK copy if they had one
      let dekCopyDeleted = false;
      if (trustedContact.clerkUserId) {
        const planOwner = await tx
          .select({ userId: plans.userId })
          .from(plans)
          .where(eq(plans.id, planId));

        if (planOwner[0]) {
          await tx
            .delete(encryptedDeks)
            .where(
              and(
                eq(encryptedDeks.ownerId, planOwner[0].userId),
                eq(encryptedDeks.recipientId, trustedContact.clerkUserId),
                eq(encryptedDeks.dekType, 'contact'),
                eq(encryptedDeks.planId, planId),
              ),
            );
          dekCopyDeleted = true;
        }
      }

      await this.activityLog.log(tx, {
        planId,
        action: 'updated',
        resourceType: 'trusted_contact',
        resourceId: id,
        details: { statusChange: 'revoked_by_owner', dekCopyDeleted },
      });

      this.logger.log(`Revoked trusted contact ${id} from plan ${planId}`);
    });
  }

  /**
   * Resend invitation email
   */
  async resendInvitation(id: string, planId: string): Promise<void> {
    return this.db.rls(async (tx) => {
      const [trustedContact] = await tx
        .select()
        .from(trustedContacts)
        .where(
          and(eq(trustedContacts.id, id), eq(trustedContacts.planId, planId)),
        );

      if (!trustedContact) {
        throw new NotFoundException('Trusted contact not found');
      }

      // Only allow resending for pending invitations
      if (trustedContact.accessStatus !== 'pending') {
        throw new BadRequestException(
          `Cannot resend invitation - status is ${trustedContact.accessStatus}`,
        );
      }

      // Get plan owner information
      const [plan] = await tx
        .select({
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(plans)
        .innerJoin(users, eq(plans.userId, users.id))
        .where(eq(plans.id, planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      const ownerName = `${plan.ownerFirstName} ${plan.ownerLastName}`.trim();

      // Generate new invitation token
      const invitationToken = this.invitationTokenService.generateToken({
        trustedContactId: trustedContact.id,
        planId: trustedContact.planId,
        email: trustedContact.email,
      });

      const invitationUrl = `${this.invitationBaseUrl}/invitations/${invitationToken}`;

      // Send invitation email
      await this.emailService.sendInvitation({
        to: trustedContact.email,
        contactFirstName: trustedContact.firstName,
        ownerName,
        accessLevel: trustedContact.accessLevel as AccessLevel,
        accessTiming: trustedContact.accessTiming as
          | 'immediate'
          | 'upon_passing',
        invitationUrl,
      });

      this.logger.log(`Resent invitation to ${trustedContact.email}`);
    });
  }
}
