import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Allowed MIME types for file uploads.
 * This prevents uploading potentially dangerous file types.
 */
export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  // Video (uploaded as encrypted MP4 to R2)
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
] as const;

/**
 * Sanitize a filename by removing path separators and dangerous characters.
 * Preserves the basic filename structure while preventing path traversal.
 */
function sanitizeFilename(filename: string): string {
  return (
    filename
      // Remove path separators and parent directory references
      .replace(/[/\\]/g, '')
      .replace(/\.\./g, '')
      // Remove null bytes and control characters
      .replace(/[\x00-\x1f\x7f]/g, '')
      // Trim whitespace
      .trim()
  );
}

/**
 * Schema for initiating a file upload.
 *
 * The client provides file metadata, and the API returns presigned URLs
 * for direct upload to R2.
 */
export const initiateUploadSchema = z.object({
  role: z.string().max(64).optional().default('primary'),
  parentFileId: z.uuid().optional(),
  filename: z
    .string()
    .min(1)
    .max(255)
    .transform(sanitizeFilename)
    .refine((name) => name.length > 0, {
      error: 'Filename cannot be empty after sanitization',
    }),
  mimeType: z
    .string()
    .refine(
      (type) =>
        ALLOWED_MIME_TYPES.includes(
          type as (typeof ALLOWED_MIME_TYPES)[number],
        ),
      { error: 'File type not allowed' },
    ),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024), // 1GB max
  isEncrypted: z.boolean().optional().default(false),
});

export class InitiateUploadDto extends createZodDto(initiateUploadSchema) {}
