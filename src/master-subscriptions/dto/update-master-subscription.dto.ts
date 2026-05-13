import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateMasterSubscriptionSchema = z
  .object({
    displayName: z.string().min(1).max(200).optional(),
    seatLimit: z.number().int().positive().optional(),
    status: z.enum(['active', 'past_due', 'suspended', 'cancelled']).optional(),
    currentPeriodEnd: z.iso.datetime().optional().nullable(),
    ownerConsumesSeat: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: 'At least one field must be provided',
  });

export class UpdateMasterSubscriptionDto extends createZodDto(
  updateMasterSubscriptionSchema,
) {}
