import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/components';
import { ContactProperties, LoopsClient } from 'loops';
import { Resend } from 'resend';
import { ApiConfigService } from '../config/api-config.service';
import { AccessLevel } from '../lib/types/cls';
import { AccessAcceptedEmail } from './templates/access-accepted';
import { AccessDeclinedEmail } from './templates/access-declined';
import { AccessRevokedByContactEmail } from './templates/access-revoked-by-contact';
import { InvitationImmediateEditEmail } from './templates/invitation-immediate-edit';
import { InvitationImmediateViewEmail } from './templates/invitation-immediate-view';
import { InvitationUponPassingEmail } from './templates/invitation-upon-passing';
import { EscrowEnabledEmail } from './templates/escrow-enabled';
import { EscrowRevokedEmail } from './templates/escrow-revoked';
import { KeyRecoveryEmail } from './templates/key-recovery';

export interface SendInvitationEmailData {
  to: string;
  contactFirstName: string;
  ownerName: string;
  accessLevel: AccessLevel;
  accessTiming: 'immediate' | 'upon_passing';
  invitationUrl: string;
}

export interface SendAccessAcceptedEmailData {
  to: string;
  ownerFirstName: string;
  contactName: string;
  accessLevel: AccessLevel;
  acceptedAt: Date;
}

export interface SendAccessDeclinedEmailData {
  to: string;
  ownerFirstName: string;
  contactName: string;
  declinedAt: Date;
}

export interface SendAccessRevokedEmailData {
  to: string;
  ownerFirstName: string;
  contactName: string;
  revokedAt: Date;
}

export interface SendRecoveryNotificationData {
  to: string;
  firstName: string;
  ipAddress?: string;
  userAgent?: string;
  recoveredAt: Date;
}

export interface SendEscrowEnabledEmailData {
  to: string;
  firstName: string;
  enabledAt: Date;
}

export interface SendEscrowRevokedEmailData {
  to: string;
  firstName: string;
  revokedAt: Date;
}

export interface UpdateSubscriberPropertiesData {
  email: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  signedUpAt?: Date | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly loops: LoopsClient;
  private readonly fromInvite: string;
  private readonly fromUpdates: string;
  private readonly supportEmail: string;

  constructor(private readonly config: ApiConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
    const name = this.config.get('RESEND_FROM_NAME');
    this.fromInvite = `${name} <${this.config.get('RESEND_FROM_EMAIL_INVITE')}>`;
    this.fromUpdates = `${name} <${this.config.get('RESEND_FROM_EMAIL_UPDATES')}>`;
    this.supportEmail = this.config.get('SUPPORT_EMAIL');

    this.loops = new LoopsClient(this.config.get('LOOPS_API_KEY'));
  }

  /**
   * Send invitation email to trusted contact
   */
  async sendInvitation(data: SendInvitationEmailData): Promise<void> {
    try {
      let emailHtml: string;
      let subject: string;

      if (data.accessTiming === 'upon_passing') {
        // Upon passing invitation
        emailHtml = await render(
          InvitationUponPassingEmail({
            contactFirstName: data.contactFirstName,
            ownerName: data.ownerName,
            invitationUrl: data.invitationUrl,
          }),
        );
        subject = `You've been designated as a trusted contact for ${data.ownerName}'s legacy plan`;
      } else if (data.accessLevel === 'full_edit') {
        // Immediate edit access
        emailHtml = await render(
          InvitationImmediateEditEmail({
            contactFirstName: data.contactFirstName,
            ownerName: data.ownerName,
            invitationUrl: data.invitationUrl,
          }),
        );
        subject = `You've been invited to help manage ${data.ownerName}'s Legacy Made plan`;
      } else {
        // Immediate view access (full_view or limited_view)
        emailHtml = await render(
          InvitationImmediateViewEmail({
            contactFirstName: data.contactFirstName,
            ownerName: data.ownerName,
            accessLevel: data.accessLevel,
            invitationUrl: data.invitationUrl,
          }),
        );
        subject = `You've been invited to view ${data.ownerName}'s Legacy Made plan`;
      }

      await this.resend.emails.send({
        from: this.fromInvite,
        replyTo: this.supportEmail,
        to: data.to,
        subject,
        html: emailHtml,
      });

      this.logger.log(`Invitation email sent to ${data.to}`);
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${data.to}`, error);
      throw error;
    }
  }

  /**
   * Notify plan owner that their invitation was accepted
   */
  async sendAccessAccepted(data: SendAccessAcceptedEmailData): Promise<void> {
    try {
      const emailHtml = await render(
        AccessAcceptedEmail({
          ownerFirstName: data.ownerFirstName,
          contactName: data.contactName,
          accessLevel: data.accessLevel,
          acceptedAt: data.acceptedAt,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: `${data.contactName} accepted your invitation to access your Legacy Made plan`,
        html: emailHtml,
      });

      this.logger.log(`Access accepted notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send access accepted email to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Notify plan owner that their invitation was declined
   */
  async sendAccessDeclined(data: SendAccessDeclinedEmailData): Promise<void> {
    try {
      const emailHtml = await render(
        AccessDeclinedEmail({
          ownerFirstName: data.ownerFirstName,
          contactName: data.contactName,
          declinedAt: data.declinedAt,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: `${data.contactName} declined your invitation to access your Legacy Made plan`,
        html: emailHtml,
      });

      this.logger.log(`Access declined notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send access declined email to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Notify plan owner that a contact revoked their own access
   */
  async sendAccessRevokedByContact(
    data: SendAccessRevokedEmailData,
  ): Promise<void> {
    try {
      const emailHtml = await render(
        AccessRevokedByContactEmail({
          ownerFirstName: data.ownerFirstName,
          contactName: data.contactName,
          revokedAt: data.revokedAt,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: `${data.contactName} has removed their access to your Legacy Made plan`,
        html: emailHtml,
      });

      this.logger.log(`Access revoked notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send access revoked email to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Notify user that a key recovery was performed on their account
   */
  async sendRecoveryNotification(
    data: SendRecoveryNotificationData,
  ): Promise<void> {
    try {
      const emailHtml = await render(
        KeyRecoveryEmail({
          firstName: data.firstName,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          recoveredAt: data.recoveredAt,
          supportEmail: this.supportEmail,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: 'Key recovery performed on your Legacy Made account',
        html: emailHtml,
      });

      this.logger.log(`Recovery notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send recovery notification to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Notify user that KMS escrow recovery was enabled on their account
   */
  async sendEscrowEnabledNotification(
    data: SendEscrowEnabledEmailData,
  ): Promise<void> {
    try {
      const emailHtml = await render(
        EscrowEnabledEmail({
          firstName: data.firstName,
          enabledAt: data.enabledAt,
          supportEmail: this.supportEmail,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: 'Legacy Made recovery has been turned on',
        html: emailHtml,
      });

      this.logger.log(`Escrow enabled notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send escrow enabled notification to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Notify user that KMS escrow recovery was disabled on their account
   */
  async sendEscrowRevokedNotification(
    data: SendEscrowRevokedEmailData,
  ): Promise<void> {
    try {
      const emailHtml = await render(
        EscrowRevokedEmail({
          firstName: data.firstName,
          revokedAt: data.revokedAt,
          supportEmail: this.supportEmail,
        }),
      );

      await this.resend.emails.send({
        from: this.fromUpdates,
        replyTo: this.supportEmail,
        to: data.to,
        subject: 'Legacy Made recovery has been turned off',
        html: emailHtml,
      });

      this.logger.log(`Escrow revoked notification sent to ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send escrow revoked notification to ${data.to}`,
        error,
      );
      throw error;
    }
  }

  async updateSubscriberProperties(data: UpdateSubscriberPropertiesData) {
    const properties: ContactProperties = {
      appUserId: data.userId,
    };

    if (data.signedUpAt) {
      properties.appSignedUpAt = data.signedUpAt.toISOString();
    }

    if (data.firstName) {
      properties.firstName = data.firstName;
    }

    if (data.lastName) {
      properties.lastName = data.lastName;
    }

    await this.loops.updateContact({
      email: data.email,
      properties,
    });
  }
}
