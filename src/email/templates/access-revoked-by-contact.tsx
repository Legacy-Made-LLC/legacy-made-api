import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail } from './base';

interface AccessRevokedByContactEmailProps {
  ownerFirstName: string;
  contactName: string;
  revokedAt: Date;
}

export const AccessRevokedByContactEmail = ({
  ownerFirstName,
  contactName,
  revokedAt,
}: AccessRevokedByContactEmailProps) => {
  return (
    <BaseEmail
      preview={`${contactName} has removed their access`}
      heading="Access Removed"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has removed their access to your Legacy Made plan.
      </Text>
      <Text style={paragraph}>
        They will no longer be able to view or edit your plan information. If
        this was unexpected, you may want to reach out to them directly.
      </Text>
      <Text style={paragraph}>
        <em>Removed on {revokedAt.toLocaleDateString()}</em>
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

export default AccessRevokedByContactEmail;
