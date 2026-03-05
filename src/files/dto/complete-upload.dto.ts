import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for completing a multipart upload.
 *
 * For R2 multipart uploads, the client must provide:
 * - uploadId: The upload ID returned from initiateUpload
 * - parts: The ETags returned from each part upload
 */
export const completeUploadSchema = z.object({
  /**
   * The upload ID returned from initiateUpload (required for multipart uploads).
   */
  uploadId: z.string().min(1).optional(),
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
