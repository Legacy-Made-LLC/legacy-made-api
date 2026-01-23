import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for updating an entry.
 *
 * All fields are optional - only provided fields will be updated.
 * Note: taskKey cannot be changed after creation.
 */
export const updateEntrySchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class UpdateEntryDto extends createZodDto(updateEntrySchema) {}
