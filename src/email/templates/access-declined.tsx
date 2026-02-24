import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

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
      heading="Invitation Declined"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has declined your invitation to access your Legacy Made
        plan.
      </Text>
      <Text style={paragraph}>
        You may want to reach out to them directly to understand their decision
        or to send a new invitation at a later time.
      </Text>
      <Text style={paragraph}>
        <em>Declined on {declinedAt.toLocaleDateString()}</em>
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

export default AccessDeclinedEmail;
