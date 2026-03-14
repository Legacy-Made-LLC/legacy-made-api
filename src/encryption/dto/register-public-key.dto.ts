import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerPublicKeySchema = z.object({
  publicKey: z.string().min(1),
  keyType: z.enum(['device', 'recovery']),
  deviceLabel: z.string().max(100).optional(),
});

export class RegisterPublicKeyDto extends createZodDto(
  registerPublicKeySchema,
) {}
