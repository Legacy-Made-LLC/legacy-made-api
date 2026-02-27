import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, buttonPrimary, linkStyle, paragraph, secondaryText } from './base';

interface InvitationImmediateEditEmailProps {
  contactFirstName: string;
  ownerName: string;
  invitationUrl: string;
}

export const InvitationImmediateEditEmail = ({
  contactFirstName,
  ownerName,
  invitationUrl,
}: InvitationImmediateEditEmailProps) => {
  return (
    <BaseEmail
      preview={`${ownerName} would like your help with their Legacy Made plan`}
      heading={`${ownerName} would like your help with their plan`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has invited you to help manage their Legacy Made plan. You'll
        be able to add, update, and organize their important information,
        wishes, and messages alongside them.
      </Text>
      <Text style={paragraph}>
        Legacy Made helps people organize and share what matters most with the
        people they trust.
      </Text>
      <Text style={paragraph}>
        Whenever you're ready, click below to view the invitation and get
        started.
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

InvitationImmediateEditEmail.PreviewProps = {
  contactFirstName: 'Sarah',
  ownerName: 'Michael Johnson',
  invitationUrl: 'https://app.mylegacymade.com/invitations/abc123xyz456',
} satisfies InvitationImmediateEditEmailProps;

export default InvitationImmediateEditEmail;
