import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const depositPayloadSchema = z.object({
  sessionCode: z.string().min(1),
  encryptedPayload: z.string().min(1),
});

export class DepositPayloadDto extends createZodDto(depositPayloadSchema) {}
