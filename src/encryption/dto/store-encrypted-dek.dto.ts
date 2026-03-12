import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const storeEncryptedDekSchema = z.object({
  planId: z.uuid(),
  recipientId: z.string().min(1),
  dekType: z.enum(['recovery', 'device', 'contact']),
  encryptedDek: z.string().min(1),
  keyVersion: z.number().int().positive(),
});

export class StoreEncryptedDekDto extends createZodDto(
  storeEncryptedDekSchema,
) {}
