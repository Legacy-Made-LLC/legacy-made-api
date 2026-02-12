import { createZodDto } from 'nestjs-zod';
import { NewProgress } from 'src/schema';
import { z, ZodType } from 'zod';

export const upsertProgressSchema = z.object({
  data: z.record(z.string(), z.unknown()).default({}),
}) satisfies ZodType<Omit<NewProgress, 'planId' | 'key'>>;

export class UpsertProgressDto extends createZodDto(upsertProgressSchema) {}
