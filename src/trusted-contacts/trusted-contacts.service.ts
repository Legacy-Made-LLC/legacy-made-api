import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { trustedContacts, users, plans, type TrustedContact } from '../schema';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { InvitationTokenService } from './invitation-token.service';

@Injectable()
export class TrustedContactsService {
  private readonly logger = new Logger(TrustedContactsService.name);

  constructor(
    private readonly db: DbService,
    private readonly emailService: EmailService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Create a new trusted contact and send invitation email
   */
  async create(
    planId: string,
    dto: CreateTrustedContactDto,
  ): Promise<TrustedContact> {
    return this.db.rls(async (tx) => {
      // Insert the trusted contact
      const [trustedContact] = await tx
        .insert(trustedContacts)
        .values({
          planId,
          ...dto,
          accessStatus: 'pending',
        })
        .returning();

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

      // TODO: Replace with actual frontend URL from config
      const invitationUrl = `https://app.legacymade.com/invitations/${invitationToken}`;

      // Send invitation email
      try {
        await this.emailService.sendInvitation({
          to: trustedContact.email,
          contactFirstName: trustedContact.firstName,
          ownerName,
          accessLevel: trustedContact.accessLevel as
            | 'full_edit'
            | 'full_view'
            | 'limited_view'
            | 'view_only',
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
        action: 'created',
        resourceType: 'trusted_contact',
        resourceId: trustedContact.id,
      });

      return trustedContact;
    });
  }

  /**
   * Get all trusted contacts for a plan
   */
  async findAll(planId: string): Promise<TrustedContact[]> {
    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.planId, planId))
        .orderBy(trustedContacts.createdAt);
    });
  }

  /**
   * Get a specific trusted contact
   */
  async findOne(id: string, planId: string): Promise<TrustedContact> {
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

      return trustedContact;
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
   * Revoke access (delete trusted contact)
   */
  async remove(id: string, planId: string): Promise<void> {
    return this.db.rls(async (tx) => {
      const result = await tx
        .delete(trustedContacts)
        .where(
          and(eq(trustedContacts.id, id), eq(trustedContacts.planId, planId)),
        )
        .returning();

      if (!result.length) {
        throw new NotFoundException('Trusted contact not found');
      }

      await this.activityLog.log(tx, {
        planId,
        action: 'deleted',
        resourceType: 'trusted_contact',
        resourceId: id,
      });

      this.logger.log(`Removed trusted contact ${id} from plan ${planId}`);
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

      const invitationUrl = `https://app.legacymade.com/invitations/${invitationToken}`;

      // Send invitation email
      await this.emailService.sendInvitation({
        to: trustedContact.email,
        contactFirstName: trustedContact.firstName,
        ownerName,
        accessLevel: trustedContact.accessLevel as
          | 'full_edit'
          | 'full_view'
          | 'limited_view'
          | 'view_only',
        accessTiming: trustedContact.accessTiming as
          | 'immediate'
          | 'upon_passing',
        invitationUrl,
      });

      this.logger.log(`Resent invitation to ${trustedContact.email}`);
    });
  }
}
