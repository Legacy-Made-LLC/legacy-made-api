import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for creating a shareable link for a file.
 *
 * The expiration time is specified in hours (1 hour to 7 days).
 */
export const createShareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168).default(24), // 1 hour to 7 days
});

export class CreateShareLinkDto extends createZodDto(createShareLinkSchema) {}
