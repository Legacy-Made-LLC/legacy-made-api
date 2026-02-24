import { createZodDto } from 'nestjs-zod';
import { createTrustedContactSchema } from './create-trusted-contact.dto';

// Allow updating all fields except email (email is immutable once set)
export const updateTrustedContactSchema = createTrustedContactSchema
  .omit({ email: true })
  .partial();

export class UpdateTrustedContactDto extends createZodDto(
  updateTrustedContactSchema,
) {}
