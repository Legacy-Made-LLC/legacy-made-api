import { createZodDto } from 'nestjs-zod';
import { z, ZodDefault, ZodObject, ZodRawShape } from 'zod';
import { RemindersSchema } from '../notification-schemas';

/**
 * Strips `.default()` wrappers from all fields in a ZodObject so that
 * `.partial()` produces truly optional (undefined) fields instead of
 * fields that silently fill in default values.
 *
 * Why this matters: RemindersSchema fields like `enabled` have
 * `.default(true)`. If we call `.partial()` directly, an omitted field
 * would parse as `true` instead of `undefined`, making it impossible for
 * the client to send a sparse PATCH that only touches the fields it
 * intends to change.
 *
 * Note: relies on Zod v4's `ZodDefault` class. If Zod renames or removes
 * this class in a future version, this will need updating.
 */
function stripDefaults<T extends ZodRawShape>(schema: ZodObject<T>) {
  const stripped = Object.fromEntries(
    Object.entries(schema.shape).map(([key, val]) => [
      key,
      val instanceof ZodDefault ? val.removeDefault() : val,
    ]),
  );
  return z.object(stripped);
}

export const updatePreferencesSchema = z.object({
  notifications: z.object({
    reminders: stripDefaults(RemindersSchema).partial().optional(),
  }),
});

export class UpdatePreferencesDto extends createZodDto(
  updatePreferencesSchema,
) {}
