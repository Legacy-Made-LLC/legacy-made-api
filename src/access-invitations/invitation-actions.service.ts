import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DrizzleTransaction } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { AccessLevel } from '../lib/types/cls';
import {
  plans,
  trustedContacts,
  users,
  encryptedDeks,
  type TrustedContact,
} from '../schema';

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
    private readonly encryptionService: EncryptionService,
    private readonly pushNotifications: PushNotificationsService,
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

    // Check if a contact DEK was already pre-shared for this user
    const [existingDek] = await tx
      .select({ id: encryptedDeks.id })
      .from(encryptedDeks)
      .where(
        and(
          eq(encryptedDeks.planId, trustedContact.planId),
          eq(encryptedDeks.recipientId, userId),
          eq(encryptedDeks.dekType, 'contact'),
        ),
      )
      .limit(1);

    await this.logAndNotifyOwner(tx, trustedContact, 'accepted', {
      dekAlreadyShared: !!existingDek,
    });

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

    // Delete any pre-shared contact DEK
    const recipientId =
      trustedContact.clerkUserId ??
      (await this.encryptionService.resolveUserIdByEmail(trustedContact.email));

    if (recipientId) {
      await this.encryptionService.deleteContactDekCopy(
        trustedContact.planId,
        recipientId,
      );
    }

    await this.logAndNotifyOwner(tx, trustedContact, 'declined');
  }

  private async logAndNotifyOwner(
    tx: DrizzleTransaction,
    trustedContact: TrustedContact,
    statusChange: 'accepted' | 'declined',
    options?: { dekAlreadyShared?: boolean },
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
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
      })
      .from(plans)
      .innerJoin(users, eq(plans.userId, users.id))
      .where(eq(plans.id, trustedContact.planId));

    if (!owner) {
      this.logger.warn(
        `Couldn't send ${statusChange} notification because plan owner not found.`,
      );
      return;
    }

    const contactName =
      `${trustedContact.firstName} ${trustedContact.lastName}`.trim();

    // Send email notification
    if (owner.email) {
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
        `Couldn't send ${statusChange} email because plan owner has no email.`,
      );
    }

    // Send push notification
    try {
      if (statusChange === 'accepted') {
        const dekShared = options?.dekAlreadyShared ?? false;
        const message = dekShared
          ? `${contactName} accepted your invitation and now has access to your plan.`
          : `${contactName} accepted your invitation. Share your encryption key to grant access.`;

        await this.pushNotifications.sendToUser(
          owner.id,
          'Invitation Accepted',
          message,
          {
            type: 'invitation_accepted',
            planId: trustedContact.planId,
            dekShared,
          },
        );
      } else {
        await this.pushNotifications.sendToUser(
          owner.id,
          'Invitation Declined',
          `${contactName} declined your invitation.`,
          { type: 'invitation_declined', planId: trustedContact.planId },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send owner ${statusChange} push notification`,
        error,
      );
    }
  }
}
