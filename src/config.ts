import { z } from 'zod';

export const configSchema = z.object({
  // GENERAL
  PORT: z.coerce.number().optional().default(3000),

  // DATABASE
  DATABASE_URL: z.string(),

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
});

export type Config = z.infer<typeof configSchema>;
