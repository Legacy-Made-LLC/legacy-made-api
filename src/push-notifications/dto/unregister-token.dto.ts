import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const unregisterTokenSchema = z.object({
  token: z.string().min(1),
});

export class UnregisterTokenDto extends createZodDto(unregisterTokenSchema) {}
