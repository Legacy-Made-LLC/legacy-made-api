import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const getUserKeysQuerySchema = z.object({
  // By default, only active keys are returned (for key exchange).
  // Set to true to include deactivated keys (e.g. for the key owner's dashboard).
  includeInactive: z.stringbool().optional(),
});

export class GetUserKeysQueryDto extends createZodDto(getUserKeysQuerySchema) {}
