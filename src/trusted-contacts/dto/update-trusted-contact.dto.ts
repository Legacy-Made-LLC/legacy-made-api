import { createZodDto } from 'nestjs-zod';
import { contactFieldsSchema } from './create-trusted-contact.dto';

// Allow updating all fields except email (email is immutable once set)
export const updateTrustedContactSchema = contactFieldsSchema
  .omit({ email: true })
  .partial();

export class UpdateTrustedContactDto extends createZodDto(
  updateTrustedContactSchema,
) {}
