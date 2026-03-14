import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const getMyKeysQuerySchema = z.object({
  // Filters keys by active status. Omit to return all keys (active and inactive).
  active: z.stringbool().optional(),
});

export class GetMyKeysQueryDto extends createZodDto(getMyKeysQuerySchema) {}
