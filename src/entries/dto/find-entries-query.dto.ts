import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for query parameters when finding entries.
 */
export const findEntriesQuerySchema = z.object({
  taskKey: z.string().optional(),
});

export class FindEntriesQueryDto extends createZodDto(findEntriesQuerySchema) {}
