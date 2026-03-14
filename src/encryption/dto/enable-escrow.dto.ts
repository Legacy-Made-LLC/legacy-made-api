import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const enableEscrowSchema = z.object({
  planId: z.uuid(),
  encryptedDek: z.string().min(680).max(800), // Base64-encoded RSA-4096 OAEP ciphertext (~684 base64 chars)
});

export class EnableEscrowDto extends createZodDto(enableEscrowSchema) {}
