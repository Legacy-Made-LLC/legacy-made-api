import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, buttonPrimary, linkStyle, paragraph, secondaryText } from './base';

interface InvitationImmediateViewEmailProps {
  contactFirstName: string;
  ownerName: string;
  accessLevel: string;
  invitationUrl: string;
}

export const InvitationImmediateViewEmail = ({
  contactFirstName,
  ownerName,
  accessLevel,
  invitationUrl,
}: InvitationImmediateViewEmailProps) => {
  const accessDescription =
    accessLevel === 'full_view'
      ? 'view all information in their legacy plan, including important entries, wishes, and messages'
      : 'view wishes and personal messages';

  return (
    <BaseEmail
      preview={`${ownerName} has shared their Legacy Made plan with you`}
      heading={`${ownerName} has shared their plan with you`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has invited you to {accessDescription}. This is their way of
        keeping you connected to what matters most to them.
      </Text>
      <Text style={paragraph}>
        Whenever you're ready, click below to view the invitation.
      </Text>
      <Button style={buttonPrimary} href={invitationUrl}>
        View Invitation
      </Button>
      <Text style={secondaryText}>
        Or copy and paste this URL into your browser:{' '}
        <Link href={invitationUrl} style={linkStyle}>
          {invitationUrl}
        </Link>
      </Text>
    </BaseEmail>
  );
};

InvitationImmediateViewEmail.PreviewProps = {
  contactFirstName: 'Sarah',
  ownerName: 'Michael Johnson',
  accessLevel: 'full_view',
  invitationUrl: 'https://app.legacymade.com/invitations/abc123xyz456',
} satisfies InvitationImmediateViewEmailProps;

export default InvitationImmediateViewEmail;
