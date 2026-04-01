import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateTimezoneSchema = z.object({
  timezone: z
    .string()
    .min(1)
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
