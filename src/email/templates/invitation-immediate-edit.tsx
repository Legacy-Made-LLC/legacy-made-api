import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

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
      preview={`You've been invited to help manage ${ownerName}'s Legacy Made plan`}
      heading={`${ownerName} has invited you to help manage their Legacy Made plan`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has granted you edit access to their Legacy Made plan. This
        means you can help them add, update, and organize their important
        information, wishes, and messages.
      </Text>
      <Text style={paragraph}>
        Legacy Made helps people organize and share their important
        information, wishes, and messages with trusted family members and
        friends.
      </Text>
      <Text style={paragraph}>
        Click the button below to accept this invitation and start helping:
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

export default InvitationImmediateEditEmail;
