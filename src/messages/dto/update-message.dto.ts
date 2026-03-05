import { createZodDto } from 'nestjs-zod';
import { createMessageSchema } from './create-message.dto';

/**
 * Schema for updating a message.
 *
 * All fields are optional - only provided fields will be updated.
 * Note: taskKey cannot be changed after creation.
 */
export const updateMessageSchema = createMessageSchema.partial();

export class UpdateMessageDto extends createZodDto(updateMessageSchema) {}
