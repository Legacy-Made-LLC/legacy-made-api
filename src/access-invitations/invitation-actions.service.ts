import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DrizzleTransaction } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { AccessLevel } from '../lib/types/cls';
import { plans, trustedContacts, users, type TrustedContact } from '../schema';

/**
 * Shared service for invitation accept/decline operations.
 *
 * Used by both AccessInvitationsService (token-based flow) and
 * SharedPlansService (plan-based flow) to avoid duplicating the
 * update, logging, and notification logic.
 */
@Injectable()
export class InvitationActionsService {
  private readonly logger = new Logger(InvitationActionsService.name);

  constructor(
    private readonly activityLog: ActivityLogService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Accept a pending invitation: update status, log activity, notify owner.
   * The caller is responsible for looking up and validating the trusted contact.
   */
  async performAccept(
    tx: DrizzleTransaction,
    trustedContact: TrustedContact,
    userId: string,
  ): Promise<Omit<TrustedContact, 'notes'>> {
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
  }

  /**
   * Decline a pending invitation: update status, log activity, notify owner.
   * The caller is responsible for looking up and validating the trusted contact.
   */
  async performDecline(
    tx: DrizzleTransaction,
    trustedContact: TrustedContact,
  ): Promise<void> {
    await tx
      .update(trustedContacts)
      .set({
        accessStatus: 'declined',
        declinedAt: new Date(),
      })
      .where(eq(trustedContacts.id, trustedContact.id));

    await this.logAndNotifyOwner(tx, trustedContact, 'declined');
  }

  private async logAndNotifyOwner(
    tx: DrizzleTransaction,
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
      `Invitation ${statusChange} for trusted contact ${trustedContact.id}`,
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
            accessLevel: trustedContact.accessLevel as AccessLevel,
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
    } else {
      this.logger.warn(
        `Couldn't send ${statusChange} notification because plan owner has no email.`,
      );
    }
  }
}
