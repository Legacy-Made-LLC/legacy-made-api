import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for query parameters when finding messages.
 */
export const findMessagesQuerySchema = z.object({
  taskKey: z.string().optional(),
});

export class FindMessagesQueryDto extends createZodDto(
  findMessagesQuerySchema,
) {}
