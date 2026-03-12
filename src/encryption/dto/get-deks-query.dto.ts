import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const getDeksQuerySchema = z.object({
  planId: z.uuid().optional(),
});

export class GetDeksQueryDto extends createZodDto(getDeksQuerySchema) {}
