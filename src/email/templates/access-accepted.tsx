import { Text } from '@react-email/components';
import * as React from 'react';
import {
  ACCESS_LEVEL_DESCRIPTIONS,
  ACCESS_LEVEL_LABELS,
} from '../../lib/access-level-labels';
import { AccessLevel } from '../../lib/types/cls';
import { BaseEmail, paragraph, secondaryText } from './base';

interface AccessAcceptedEmailProps {
  ownerFirstName: string;
  contactName: string;
  accessLevel: AccessLevel;
  acceptedAt: Date;
}

export const AccessAcceptedEmail = ({
  ownerFirstName,
  contactName,
  accessLevel,
  acceptedAt,
}: AccessAcceptedEmailProps) => {
  return (
    <BaseEmail
      preview={`${contactName} accepted your invitation`}
      heading="Good news — your invitation was accepted"
    >
      <Text style={paragraph}>Hi {ownerFirstName},</Text>
      <Text style={paragraph}>
        {contactName} has accepted your invitation and{' '}
        {ACCESS_LEVEL_DESCRIPTIONS[accessLevel]}.
      </Text>
      <Text style={paragraph}>
        <strong style={{ color: '#1A1A1A' }}>Access level:</strong>{' '}
        {ACCESS_LEVEL_LABELS[accessLevel]}
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
