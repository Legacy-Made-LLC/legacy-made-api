import { createZodDto } from 'nestjs-zod';
import { NewWish } from 'src/schema';
import { z, ZodType } from 'zod';
import { metadataSchemaSchema } from '../../common/dto/metadata-schema';

/**
 * Schema for creating a new wish.
 *
 * The taskKey identifies the wish type (controlled by frontend).
 * Metadata is a flexible object for type-specific data - the backend
 * does not validate its structure beyond ensuring it's a valid object.
 * MetadataSchema is optional and defines the structure of the metadata field.
 */
export const createWishSchema = z.object({
  taskKey: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
  metadataSchema: metadataSchemaSchema.optional().nullable(),
}) satisfies ZodType<Omit<NewWish, 'planId'>>;

export class CreateWishDto extends createZodDto(createWishSchema) {}
