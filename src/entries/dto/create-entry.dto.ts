import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for creating a new entry.
 *
 * The taskKey identifies the entry type (controlled by frontend).
 * Metadata is a flexible object for type-specific data - the backend
 * does not validate its structure beyond ensuring it's a valid object.
 */
export const createEntrySchema = z.object({
  taskKey: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export class CreateEntryDto extends createZodDto(createEntrySchema) {}
