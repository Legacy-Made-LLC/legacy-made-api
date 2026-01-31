import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Mux video metadata that will be associated with the asset.
 * See: https://docs.mux.com/api-reference#video/operation/create-asset
 */
export const muxMetaSchema = z.object({
  /** Identifier to link the asset to your own data. Max 128 characters. */
  externalId: z.string().max(128).optional(),
  /** Identifier to track the creator of the asset. Max 128 characters. */
  creatorId: z.string().max(128).optional(),
  /** The asset title. Max 512 characters. */
  title: z.string().max(512).optional(),
});

export type MuxMeta = z.infer<typeof muxMetaSchema>;

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
  /**
   * Mux asset metadata (for video uploads only).
   */
  meta: muxMetaSchema.optional(),
  /**
   * Arbitrary passthrough string included in Mux asset details and webhooks.
   * Max 255 characters. (for video uploads only)
   */
  passthrough: z.string().max(255).optional(),
});

export class InitiateUploadDto extends createZodDto(initiateUploadSchema) {}
