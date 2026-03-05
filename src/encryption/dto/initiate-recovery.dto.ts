import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const initiateRecoverySchema = z.object({
  newPublicKey: z.string().min(1), // Base64-encoded new public key
});

export class InitiateRecoveryDto extends createZodDto(initiateRecoverySchema) {}
