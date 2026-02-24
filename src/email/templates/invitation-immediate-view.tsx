import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

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
      preview={`You've been invited to view ${ownerName}'s Legacy Made plan`}
      heading={`${ownerName} has invited you to view their Legacy Made plan`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has granted you access to {accessDescription}.
      </Text>
      <Text style={paragraph}>
        Legacy Made helps people organize and share their important
        information, wishes, and messages with trusted family members and
        friends.
      </Text>
      <Text style={paragraph}>
        Click the button below to accept this invitation and view their plan:
      </Text>
      <Button style={button} href={invitationUrl}>
        View Invitation
      </Button>
      <Text style={paragraph}>
        Or copy and paste this URL into your browser:{' '}
        <Link href={invitationUrl} style={link}>
          {invitationUrl}
        </Link>
      </Text>
    </BaseEmail>
  );
};

const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  marginBottom: '16px',
};

const button = {
  backgroundColor: '#5469d4',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '12px',
  marginTop: '24px',
  marginBottom: '24px',
};

const link = {
  color: '#5469d4',
  textDecoration: 'underline',
};

export default InvitationImmediateViewEmail;
