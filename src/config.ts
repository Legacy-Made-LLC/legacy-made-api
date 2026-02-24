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

  // MUX
  MUX_TOKEN_ID: z.string(),
  MUX_TOKEN_SECRET: z.string(),
  MUX_SIGNING_KEY_ID: z.string(),
  MUX_SIGNING_KEY_SECRET: z.string(),
  MUX_WEBHOOK_SECRET: z.string(),

  // RESEND (Email Service)
  RESEND_API_KEY: z.string(),
  RESEND_FROM_EMAIL_INVITE: z.email().default('invite@notify.mylegacymade.com'),
  RESEND_FROM_EMAIL_UPDATES: z
    .email()
    .default('updates@notify.mylegacymade.com'),
  RESEND_FROM_NAME: z.string().default('Legacy Made'),

  // INVITATION TOKENS
  INVITATION_TOKEN_SECRET: z.string(),
  INVITATION_BASE_URL: z.string().url().default('https://app.mylegacymade.com'),

  // FILE UPLOAD
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .optional()
    .default(1024 * 1024 * 1024), // 1GB
  MULTIPART_THRESHOLD_BYTES: z.coerce
    .number()
    .optional()
    .default(100 * 1024 * 1024), // 100MB

  // FEATURE FLAGS
  GRANT_LIFETIME_TO_NEW_USERS: z
    .stringbool({
      truthy: ['true', '1'],
      falsy: ['false', '0'],
    })
    .default(false),
});

export type Config = z.infer<typeof configSchema>;
