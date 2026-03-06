import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createCheckoutSchema = z.object({
  tier: z.enum(['individual', 'family']),
});

export class CreateCheckoutDto extends createZodDto(createCheckoutSchema) {}
