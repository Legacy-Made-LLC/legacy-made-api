import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const claimSessionSchema = z.object({
  sessionCode: z.string().min(1),
});

export class ClaimSessionDto extends createZodDto(claimSessionSchema) {}
