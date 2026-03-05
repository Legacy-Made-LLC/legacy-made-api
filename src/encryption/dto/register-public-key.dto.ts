import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerPublicKeySchema = z.object({
  publicKey: z.string().min(1),
});

export class RegisterPublicKeyDto extends createZodDto(
  registerPublicKeySchema,
) {}
