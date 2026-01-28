import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for initiating a file upload.
 *
 * The client provides file metadata, and the API returns presigned URLs
 * for direct upload to R2 or Mux.
 */
export const initiateUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024), // 1GB max
});

export class InitiateUploadDto extends createZodDto(initiateUploadSchema) {}
