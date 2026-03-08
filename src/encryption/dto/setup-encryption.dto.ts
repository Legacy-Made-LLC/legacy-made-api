import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const setupEncryptionSchema = z.object({
  publicKey: z.string().min(1),
  planId: z.string().uuid(),
  encryptedDek: z.string().min(1),
  deviceLabel: z.string().max(100).optional(),
});

export class SetupEncryptionDto extends createZodDto(setupEncryptionSchema) {}
