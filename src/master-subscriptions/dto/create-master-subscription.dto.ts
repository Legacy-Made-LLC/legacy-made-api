import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createMasterSubscriptionSchema = z.object({
  ownerUserId: z.string().min(1),
  displayName: z.string().min(1).max(200),
  seatLimit: z.number().int().positive(),
  // Locked to 'individual' for MVP per the plan; the column is text in
  // the schema so Phase 2 can promote without a migration.
  tier: z.enum(['individual']).default('individual'),
  ownerConsumesSeat: z.boolean().default(true),
  currentPeriodEnd: z.iso.datetime().optional().nullable(),
});

export class CreateMasterSubscriptionDto extends createZodDto(
  createMasterSubscriptionSchema,
) {}
