import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const storeEncryptedDekSchema = z.object({
  recipientId: z.string().min(1),
  dekType: z.enum(['owner', 'contact']),
  encryptedDek: z.string().min(1),
  keyVersion: z.number().int().positive(),
});

export class StoreEncryptedDekDto extends createZodDto(
  storeEncryptedDekSchema,
) {}
