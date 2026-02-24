import { createZodDto } from 'nestjs-zod';
import { type NewTrustedContact } from 'src/schema';
import { z, ZodType } from 'zod';

export const createTrustedContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.string().optional(),
  accessLevel: z.enum(['full_edit', 'full_view', 'limited_view', 'view_only']),
  accessTiming: z.enum(['immediate', 'upon_passing']),
  notes: z.string().optional(),
}) satisfies ZodType<
  Omit<
    NewTrustedContact,
    | 'planId'
    | 'accessStatus'
    | 'invitedAt'
    | 'acceptedAt'
    | 'declinedAt'
    | 'revokedAt'
    | 'clerkUserId'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export class CreateTrustedContactDto extends createZodDto(
  createTrustedContactSchema,
) {}
