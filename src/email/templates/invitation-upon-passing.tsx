import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, buttonPrimary, linkStyle, paragraph, secondaryText } from './base';

interface InvitationUponPassingEmailProps {
  contactFirstName: string;
  ownerName: string;
  invitationUrl: string;
}

export const InvitationUponPassingEmail = ({
  contactFirstName,
  ownerName,
  invitationUrl,
}: InvitationUponPassingEmailProps) => {
  return (
    <BaseEmail
      preview={`${ownerName} has chosen you as a trusted contact`}
      heading={`${ownerName} has chosen you as a trusted contact`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has designated you as a trusted contact for their Legacy
        Made plan. When the time comes, you'll be given access to the
        information they've prepared for you.
      </Text>
      <Text style={paragraph}>
        Legacy Made helps people organize and share what matters most —
        important information, wishes, and personal messages — with the people
        they trust.
      </Text>
      <Text style={paragraph}>
        Whenever you're ready, you can acknowledge this invitation below. This
        will create your Legacy Made account and confirm you've received this
        designation.
      </Text>
      <Button style={buttonPrimary} href={invitationUrl}>
        Acknowledge Invitation
      </Button>
      <Text style={secondaryText}>
        Or copy and paste this URL into your browser:{' '}
        <Link href={invitationUrl} style={linkStyle}>
          {invitationUrl}
        </Link>
      </Text>
      <Text style={paragraph}>
        Thank you for being someone {ownerName} trusts.
      </Text>
    </BaseEmail>
  );
};

InvitationUponPassingEmail.PreviewProps = {
  contactFirstName: 'Sarah',
  ownerName: 'Michael Johnson',
  invitationUrl: 'https://app.legacymade.com/invitations/abc123xyz456',
} satisfies InvitationUponPassingEmailProps;

export default InvitationUponPassingEmail;
