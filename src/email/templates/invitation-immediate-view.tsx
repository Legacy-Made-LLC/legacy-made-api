import { Button, Link, Text } from '@react-email/components';
import * as React from 'react';
import { ACCESS_LEVEL_INVITATION_DESCRIPTIONS } from '../../lib/access-level-labels';
import { AccessLevel } from '../../lib/types/cls';
import {
  BaseEmail,
  buttonPrimary,
  linkStyle,
  paragraph,
  secondaryText,
} from './base';

interface InvitationImmediateViewEmailProps {
  contactFirstName: string;
  ownerName: string;
  accessLevel: Exclude<AccessLevel, 'full_edit'>;
  invitationUrl: string;
}

export const InvitationImmediateViewEmail = ({
  contactFirstName,
  ownerName,
  accessLevel,
  invitationUrl,
}: InvitationImmediateViewEmailProps) => {
  const accessDescription = ACCESS_LEVEL_INVITATION_DESCRIPTIONS[accessLevel];

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
