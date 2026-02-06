import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for query parameters when finding wishes.
 */
export const findWishesQuerySchema = z.object({
  taskKey: z.string().optional(),
});

export class FindWishesQueryDto extends createZodDto(findWishesQuerySchema) {}
