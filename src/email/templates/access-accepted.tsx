import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, paragraph, secondaryText } from './base';

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
      heading="Good news — your invitation was accepted"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has accepted your invitation and {accessDescription}.
      </Text>
      <Text style={paragraph}>
        <strong style={{ color: '#1A1A1A' }}>Access level:</strong>{' '}
        {accessLevel.replace(/_/g, ' ')}
      </Text>
      <Text style={secondaryText}>
        Accepted on {acceptedAt.toLocaleDateString()}
      </Text>
    </BaseEmail>
  );
};

AccessAcceptedEmail.PreviewProps = {
  ownerFirstName: 'Michael',
  contactName: 'Sarah Thompson',
  accessLevel: 'full_view',
  acceptedAt: new Date('2026-02-25T14:30:00Z'),
} satisfies AccessAcceptedEmailProps;

export default AccessAcceptedEmail;
