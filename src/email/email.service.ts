import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import { ApiConfigService } from '../config/api-config.service';
import { AccessAcceptedEmail } from './templates/access-accepted';
import { AccessDeclinedEmail } from './templates/access-declined';
import { AccessRevokedByContactEmail } from './templates/access-revoked-by-contact';
import { InvitationImmediateEditEmail } from './templates/invitation-immediate-edit';
import { InvitationImmediateViewEmail } from './templates/invitation-immediate-view';
import { InvitationUponPassingEmail } from './templates/invitation-upon-passing';

export interface SendInvitationEmailData {
  to: string;
  contactFirstName: string;
  ownerName: string;
  accessLevel: 'full_edit' | 'full_view' | 'limited_view' | 'view_only';
  accessTiming: 'immediate' | 'upon_passing';
  invitationUrl: string;
}

export interface SendAccessAcceptedEmailData {
  to: string;
  ownerFirstName: string;
  contactName: string;
  accessLevel: string;
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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromInvite: string;
  private readonly fromUpdates: string;

  constructor(private readonly config: ApiConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
    const name = this.config.get('RESEND_FROM_NAME');
    this.fromInvite = `${name} <${this.config.get('RESEND_FROM_EMAIL_INVITE')}>`;
    this.fromUpdates = `${name} <${this.config.get('RESEND_FROM_EMAIL_UPDATES')}>`;
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
}
