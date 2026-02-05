import { createZodDto } from 'nestjs-zod';
import { createEntrySchema } from './create-entry.dto';

/**
 * Schema for updating an entry.
 *
 * All fields are optional - only provided fields will be updated.
 * Note: taskKey cannot be changed after creation.
 */
export const updateEntrySchema = createEntrySchema.partial();

export class UpdateEntryDto extends createZodDto(updateEntrySchema) {}
