import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const initiateRecoverySchema = z.object({
  planId: z.uuid(),
  /** Base64-encoded new public key. Audit-only — logged in the recovery event
   *  for traceability but not registered or used server-side. The client is
   *  responsible for re-encrypting the recovered DEK and registering the new key
   *  via POST /encryption/keys after recovery completes. */
  newPublicKey: z.string().min(1),
});

export class InitiateRecoveryDto extends createZodDto(initiateRecoverySchema) {}
