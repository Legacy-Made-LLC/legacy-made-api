import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const getKeysByEmailQuerySchema = z.object({
  email: z.email(),
});

export class GetKeysByEmailQueryDto extends createZodDto(
  getKeysByEmailQuerySchema,
) {}
