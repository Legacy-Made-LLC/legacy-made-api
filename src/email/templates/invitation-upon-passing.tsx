import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

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
      preview={`You've been designated as a trusted contact for ${ownerName}'s legacy plan`}
      heading={`${ownerName} has designated you as a trusted contact`}
    >
      <Text style={paragraph}>Hi {contactFirstName},</Text>
      <Text style={paragraph}>
        {ownerName} has designated you as a trusted contact for their Legacy
        Made plan. Access to their plan will be granted when the time comes.
      </Text>
      <Text style={paragraph}>
        Legacy Made helps people organize and share their important
        information, wishes, and messages with trusted family members and
        friends.
      </Text>
      <Text style={paragraph}>
        You can acknowledge this invitation now by clicking the button below.
        This will create your Legacy Made account and confirm you've received
        this designation:
      </Text>
      <Button style={button} href={invitationUrl}>
        Acknowledge Invitation
      </Button>
      <Text style={paragraph}>
        Or copy and paste this URL into your browser:{' '}
        <Link href={invitationUrl} style={link}>
          {invitationUrl}
        </Link>
      </Text>
      <Text style={paragraph}>
        Thank you for being a trusted contact for {ownerName}.
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

export default InvitationUponPassingEmail;
