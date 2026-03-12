import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const deleteDeksQuerySchema = z.object({
  planId: z.uuid(),
  dekType: z.enum(['device', 'contact', 'recovery']), // escrow type not managed here
  recipientId: z.string().min(1).optional(),
  keyVersion: z.coerce.number().int().positive().optional(),
});

export class DeleteDeksQueryDto extends createZodDto(deleteDeksQuerySchema) {}
