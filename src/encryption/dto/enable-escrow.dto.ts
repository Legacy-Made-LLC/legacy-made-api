import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const enableEscrowSchema = z.object({
  dekPlaintext: z.string().min(1), // Base64-encoded DEK plaintext
});

export class EnableEscrowDto extends createZodDto(enableEscrowSchema) {}
