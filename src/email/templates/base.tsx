import {
  Body,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

const LOGO_URL = 'https://app.mylegacymade.com/images/legacy-made-logo.png';

interface BaseEmailProps {
  preview: string;
  heading: string;
  children: React.ReactNode;
}

export const BaseEmail = ({ preview, heading, children }: BaseEmailProps) => (
  <Html>
    <Head>
      <Font
        fontFamily="Libre Baskerville"
        fallbackFontFamily={['Georgia', 'Times New Roman', 'serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/librebaskerville/v16/kmKnZrc3Hgbbcjq75U4uslyuy4kqoRKCM.woff2',
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />
      <Font
        fontFamily="DM Sans"
        fallbackFontFamily={['Helvetica', 'Arial', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwA.woff2',
          format: 'woff2',
        }}
        fontWeight="400 600"
        fontStyle="normal"
      />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src={LOGO_URL}
            width="48"
            height="48"
            alt="Legacy Made"
            style={logo}
          />
          <Text style={wordmark}>Legacy Made</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>{heading}</Heading>
          {children}
        </Section>

        <Section style={footer}>
          <Hr style={footerDivider} />
          <Text style={footerText}>
            © {new Date().getFullYear()} Legacy Made. All rights reserved.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

// --- Shared styles (exported for use in individual templates) ---

export const paragraph: React.CSSProperties = {
  color: '#6B6B6B',
  fontFamily: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: '16px',
  lineHeight: '1.5',
  textAlign: 'left' as const,
  margin: '0 0 16px',
};

export const buttonPrimary: React.CSSProperties = {
  backgroundColor: '#8a9785',
  borderRadius: '25px',
  color: '#FFFFFF',
  fontFamily: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  marginTop: '8px',
  marginBottom: '8px',
};

export const linkStyle: React.CSSProperties = {
  color: '#8a9785',
  textDecoration: 'underline',
};

export const secondaryText: React.CSSProperties = {
  color: '#9B9B9B',
  fontFamily: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: '14px',
  lineHeight: '1.5',
  textAlign: 'left' as const,
  margin: '0 0 16px',
};

// --- Internal layout styles ---

const main: React.CSSProperties = {
  backgroundColor: '#F9F8F8',
  fontFamily: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
};

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '32px 16px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '0 0 24px',
};

const logo: React.CSSProperties = {
  margin: '0 auto 8px',
  borderRadius: '50%',
};

const wordmark: React.CSSProperties = {
  fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif",
  fontSize: '24px',
  fontWeight: '400',
  color: '#1A1A1A',
  margin: '0',
  padding: '0',
};

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  padding: '32px',
};

const h2: React.CSSProperties = {
  fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif",
  color: '#1A1A1A',
  fontSize: '22px',
  fontWeight: '400',
  lineHeight: '1.3',
  margin: '0 0 24px',
};

const footer: React.CSSProperties = {
  padding: '24px 0 0',
};

const footerDivider: React.CSSProperties = {
  borderColor: '#F0EEEB',
  borderTop: '1px solid #F0EEEB',
  margin: '0 0 16px',
};

const footerText: React.CSSProperties = {
  color: '#9B9B9B',
  fontFamily: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: '12px',
  lineHeight: '1.5',
  textAlign: 'center' as const,
  margin: '0',
};
