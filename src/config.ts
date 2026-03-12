import { z } from 'zod';

export const configSchema = z.object({
  // GENERAL
  PORT: z.coerce.number().optional().default(3000),

  // DATABASE
  DATABASE_URL_APP: z.string(),
  DATABASE_URL_MIGRATIONS: z.string(),

  // CORS
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((val) => val.split(',')),

  // CLERK
  CLERK_PUBLIC_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),
  CLERK_JWT_KEY: z.string(),
  // -- clerk: webhooks --
  SIGNING_SECRET: z.string(),

  // CLOUDFLARE R2
  R2_ENDPOINT: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),

  // AWS KMS (E2EE key escrow)
  AWS_KMS_REGION: z.string().optional().default('us-east-1'),
  AWS_KMS_ASYMMETRIC_KEY_ARN: z.string(),
  AWS_ACCESS_KEY_ID_KMS: z.string(),
  AWS_SECRET_ACCESS_KEY_KMS: z.string(),

  // RESEND (Email Service)
  RESEND_API_KEY: z.string(),
  RESEND_FROM_EMAIL_INVITE: z.email().default('invite@notify.mylegacymade.com'),
  RESEND_FROM_EMAIL_UPDATES: z
    .email()
    .default('updates@notify.mylegacymade.com'),
  RESEND_FROM_NAME: z.string().default('Legacy Made'),

  // LOOPS (Marketing Email Service)
  LOOPS_API_KEY: z.string(),

  // INVITATION TOKENS
  INVITATION_TOKEN_SECRET: z.string(),
  INVITATION_BASE_URL: z.url().default('https://app.mylegacymade.com'),

  // FILE UPLOAD
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .optional()
    .default(1024 * 1024 * 1024), // 1GB
  MULTIPART_THRESHOLD_BYTES: z.coerce
    .number()
    .optional()
    .default(100 * 1024 * 1024), // 100MB

  // SUPPORT
  SUPPORT_EMAIL: z.email().default('support@mylegacymade.com'),

  // EXPO PUSH NOTIFICATIONS
  // Optional: improves Expo rate limits and prevents token impersonation.
  // Push notifications work without it, but production deployments should set it.
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // FEATURE FLAGS
  GRANT_LIFETIME_TO_NEW_USERS: z
    .stringbool({
      truthy: ['true', '1'],
      falsy: ['false', '0'],
    })
    .default(false),
});

export type Config = z.infer<typeof configSchema>;
