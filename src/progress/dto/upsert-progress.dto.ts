import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const upsertProgressSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export class UpsertProgressDto extends createZodDto(upsertProgressSchema) {}
