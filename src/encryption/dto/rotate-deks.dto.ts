import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const rotateDeksSchema = z.object({
  planId: z.uuid(),
  newDeks: z
    .array(
      z.object({
        recipientId: z.string().min(1),
        dekType: z.enum(['recovery', 'device', 'contact']), // escrow type not managed here
        encryptedDek: z.string().min(1),
        keyVersion: z.number().int().positive(),
      }),
    )
    .min(1),
});

export class RotateDeksDto extends createZodDto(rotateDeksSchema) {}
