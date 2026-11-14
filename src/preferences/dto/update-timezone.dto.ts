import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateTimezoneSchema = z.object({
  timezone: z
    .string()
    .min(1)
    // IANA names only ("America/Denver", "UTC"). Offset strings like
    // "-0700" or "+05:00" pass Intl but Postgres rejects or inverts them.
    .regex(/^[A-Za-z][A-Za-z0-9_+\-/]*$/, { error: 'Invalid IANA timezone' })
    .refine(
      (tz) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid IANA timezone' },
    ),
});

export class UpdateTimezoneDto extends createZodDto(updateTimezoneSchema) {}
