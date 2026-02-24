import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

interface AccessAcceptedEmailProps {
  ownerFirstName: string;
  contactName: string;
  accessLevel: string;
  acceptedAt: Date;
}

export const AccessAcceptedEmail = ({
  ownerFirstName,
  contactName,
  accessLevel,
  acceptedAt,
}: AccessAcceptedEmailProps) => {
  const accessDescription =
    accessLevel === 'full_edit'
      ? 'can now view and edit your plan'
      : accessLevel === 'full_view'
        ? 'can now view all information in your plan'
        : 'can now view your wishes and messages';

  return (
    <BaseEmail
      preview={`${contactName} accepted your invitation`}
      heading="Invitation Accepted"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has accepted your invitation to access your Legacy Made
        plan.
      </Text>
      <Text style={paragraph}>
        <strong>Access level:</strong> {accessLevel.replace('_', ' ')}
      </Text>
      <Text style={paragraph}>
        {contactName} {accessDescription}.
      </Text>
      <Text style={paragraph}>
        <em>Accepted on {acceptedAt.toLocaleDateString()}</em>
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

export default AccessAcceptedEmail;
