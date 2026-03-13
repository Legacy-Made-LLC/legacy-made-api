import { Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, linkStyle, paragraph, secondaryText } from './base';

interface EscrowEnabledEmailProps {
  firstName: string;
  enabledAt: Date;
  supportEmail: string;
}

export const EscrowEnabledEmail = ({
  firstName,
  enabledAt,
  supportEmail,
}: EscrowEnabledEmailProps) => {
  return (
    <BaseEmail
      preview="Legacy Made recovery has been turned on for your account"
      heading="Legacy Made recovery turned on"
    >
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Legacy Made recovery has been turned on for your account. This means
        that if you ever lose access to all of your devices, Legacy Made can
        help you recover your encrypted data.
      </Text>
      <Text style={paragraph}>
        If you prefer fully private encryption and managing your own recovery
        options, you can turn off Legacy Made recovery at any time from your
        security settings.
      </Text>
      <Text style={secondaryText}>
        Changed on{' '}
        {enabledAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{' '}
        at{' '}
        {enabledAt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })}
      </Text>
      <Text style={paragraph}>
        If you didn't make this change, please contact support immediately at{' '}
        <Link href={`mailto:${supportEmail}`} style={linkStyle}>
          {supportEmail}
        </Link>
        .
      </Text>
    </BaseEmail>
  );
};

EscrowEnabledEmail.PreviewProps = {
  firstName: 'Michael',
  enabledAt: new Date('2026-03-11T14:30:00Z'),
  supportEmail: 'support@mylegacymade.com',
} satisfies EscrowEnabledEmailProps;

export default EscrowEnabledEmail;
