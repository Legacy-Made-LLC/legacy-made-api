import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for completing a multipart upload.
 *
 * For R2 multipart uploads, the client must provide the ETags
 * returned from each part upload.
 *
 * For Mux uploads, this is typically not needed as Mux handles
 * completion automatically.
 */
export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string().min(1),
      }),
    )
    .optional(),
});

export class CompleteUploadDto extends createZodDto(completeUploadSchema) {}
