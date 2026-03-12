import { createZodDto } from 'nestjs-zod';
import { type NewTrustedContact } from 'src/schema';
import { z, ZodType } from 'zod';

export const contactFieldsSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.string().optional(),
  accessLevel: z.enum(['full_edit', 'full_view', 'limited_view']),
  // TODO: Uncomment for MVP. Not implementing anything but immediate access for now.
  accessTiming: z.literal('immediate'), // z.enum(['immediate', 'upon_passing']),
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

export const createTrustedContactSchema = contactFieldsSchema.extend({
  // Optional pre-shared DEK copies for the invited contact's devices.
  // Note: recipientId is not validated against the contact being created. This is
  // intentional — storing a DEK copy for an arbitrary recipientId only exposes the
  // sender's own plan data and does not grant the recipient access by itself.
  // Application-level checks (RLS, plan access guards) still gate actual data access.
  deks: z
    .array(
      z.object({
        recipientId: z.string().min(1),
        encryptedDek: z.string().min(1),
        keyVersion: z.number().int().positive(),
      }),
    )
    .optional(),
});

export class CreateTrustedContactDto extends createZodDto(
  createTrustedContactSchema,
) {}
