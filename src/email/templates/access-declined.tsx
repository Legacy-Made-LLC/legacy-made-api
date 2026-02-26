import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, paragraph, secondaryText } from './base';

interface AccessDeclinedEmailProps {
  ownerFirstName: string;
  contactName: string;
  declinedAt: Date;
}

export const AccessDeclinedEmail = ({
  ownerFirstName,
  contactName,
  declinedAt,
}: AccessDeclinedEmailProps) => {
  return (
    <BaseEmail
      preview={`${contactName} declined your invitation`}
      heading="Your invitation was declined"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has declined your invitation to access your Legacy Made
        plan. Everyone has their own comfort level, and that's okay.
      </Text>
      <Text style={paragraph}>
        If you'd like, you can always reach out to them directly or send a new
        invitation later.
      </Text>
      <Text style={secondaryText}>
        Declined on {declinedAt.toLocaleDateString()}
      </Text>
    </BaseEmail>
  );
};

AccessDeclinedEmail.PreviewProps = {
  ownerFirstName: 'Michael',
  contactName: 'Sarah Thompson',
  declinedAt: new Date('2026-02-25T14:30:00Z'),
} satisfies AccessDeclinedEmailProps;

export default AccessDeclinedEmail;
