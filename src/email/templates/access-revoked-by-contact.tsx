import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, paragraph, secondaryText } from './base';

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
      heading="A contact has removed their access"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has chosen to remove their access to your Legacy Made
        plan. They will no longer be able to view or edit your plan information.
      </Text>
      <Text style={paragraph}>
        If this was unexpected, you may want to reach out to them directly.
      </Text>
      <Text style={secondaryText}>
        Removed on {revokedAt.toLocaleDateString()}
      </Text>
    </BaseEmail>
  );
};

AccessRevokedByContactEmail.PreviewProps = {
  ownerFirstName: 'Michael',
  contactName: 'Sarah Thompson',
  revokedAt: new Date('2026-02-25T14:30:00Z'),
} satisfies AccessRevokedByContactEmailProps;

export default AccessRevokedByContactEmail;
