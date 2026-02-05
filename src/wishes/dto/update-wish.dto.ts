import { createZodDto } from 'nestjs-zod';
import { createWishSchema } from './create-wish.dto';

/**
 * Schema for updating a wish.
 *
 * All fields are optional - only provided fields will be updated.
 * Note: taskKey cannot be changed after creation.
 */
export const updateWishSchema = createWishSchema.partial();

export class UpdateWishDto extends createZodDto(updateWishSchema) {}
