import { z } from 'zod';

export const configSchema = z.object({
  // GENERAL
  PORT: z.coerce.number().optional().default(3000),

  // DEV AUTH - When set, allows X-Dev-User-Id header to bypass Clerk auth
  DEV_AUTH_USER_ID: z.string().optional(),

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

  // FILE UPLOAD
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .optional()
    .default(1024 * 1024 * 1024), // 1GB
  MULTIPART_THRESHOLD_BYTES: z.coerce
    .number()
    .optional()
    .default(100 * 1024 * 1024), // 100MB
});

export type Config = z.infer<typeof configSchema>;
