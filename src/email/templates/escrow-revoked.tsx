import { Link, Text } from '@react-email/components';
import * as React from 'react';
import { BaseEmail, linkStyle, paragraph, secondaryText } from './base';

interface EscrowRevokedEmailProps {
  firstName: string;
  revokedAt: Date;
  supportEmail: string;
}

export const EscrowRevokedEmail = ({
  firstName,
  revokedAt,
  supportEmail,
}: EscrowRevokedEmailProps) => {
  return (
    <BaseEmail
      preview="Legacy Made recovery has been turned off for your account"
      heading="Legacy Made recovery turned off"
    >
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Legacy Made recovery has been turned off for your account. This means
        your plan data is now fully private to you — Legacy Made has no way to
        access or read it.
      </Text>
      <Text style={paragraph}>
        The trade-off is that if you ever lose access to all of your devices and
        don't have an offline recovery set up, we won't be able to help you
        recover your data.
      </Text>
      <Text style={paragraph}>
        If you have a personal backup stored somewhere safe, you're all set. If
        not, you can re-enable Legacy Made recovery at any time from your
        security settings.
      </Text>
      <Text style={secondaryText}>
        Changed on{' '}
        {revokedAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{' '}
        at{' '}
        {revokedAt.toLocaleTimeString('en-US', {
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

EscrowRevokedEmail.PreviewProps = {
  firstName: 'Michael',
  revokedAt: new Date('2026-03-11T14:30:00Z'),
  supportEmail: 'support@mylegacymade.com',
} satisfies EscrowRevokedEmailProps;

export default EscrowRevokedEmail;
