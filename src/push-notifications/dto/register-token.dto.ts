import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
});

export class RegisterTokenDto extends createZodDto(registerTokenSchema) {}
