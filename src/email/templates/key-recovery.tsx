import { Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, linkStyle, paragraph, secondaryText } from './base';

interface KeyRecoveryEmailProps {
  firstName: string;
  ipAddress?: string;
  userAgent?: string;
  recoveredAt: Date;
  supportEmail: string;
}

export const KeyRecoveryEmail = ({
  firstName,
  ipAddress,
  userAgent,
  recoveredAt,
  supportEmail,
}: KeyRecoveryEmailProps) => {
  return (
    <BaseEmail
      preview="A key recovery was performed on your account"
      heading="Key recovery notification"
    >
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        A key recovery was performed on your Legacy Made account. If you
        initiated this recovery, no action is needed.
      </Text>
      <Text style={paragraph}>
        <strong style={{ color: '#1A1A1A' }}>IP Address:</strong> {ipAddress}
      </Text>
      <Text style={paragraph}>
        <strong style={{ color: '#1A1A1A' }}>Device:</strong> {userAgent}
      </Text>
      <Text style={secondaryText}>
        Recovered on {recoveredAt.toLocaleDateString()} at{' '}
        {recoveredAt.toLocaleTimeString()}
      </Text>
      <Text style={paragraph}>
        If you did not initiate this recovery, please contact support
        immediately at{' '}
        <Link href={`mailto:${supportEmail}`} style={linkStyle}>
          {supportEmail}
        </Link>
        .
      </Text>
    </BaseEmail>
  );
};

KeyRecoveryEmail.PreviewProps = {
  firstName: 'Michael',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
  recoveredAt: new Date('2026-03-04T14:30:00Z'),
  supportEmail: 'support@mylegacymade.com',
} satisfies KeyRecoveryEmailProps;

export default KeyRecoveryEmail;
