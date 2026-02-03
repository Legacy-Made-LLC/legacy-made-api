import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { ApiConfigService } from '../config/api-config.service';
import { files, File, entries } from '../schema';
import { R2Service } from './r2.service';
import { MuxService } from './mux.service';
import {
  InitiateUploadDto,
  CompleteUploadDto,
  CreateShareLinkDto,
  FileResponseDto,
} from './dto';

// Part size for multipart uploads (100MB)
const PART_SIZE = 100 * 1024 * 1024;

export interface UploadInitResult {
  fileId: string;
  uploadUrl?: string;
  uploadMethod: 'PUT' | 'POST';
  expiresAt: string;
  // For multipart uploads
  uploadId?: string;
  parts?: Array<{ partNumber: number; uploadUrl: string }>;
}

export interface VideoUploadInitResult {
  fileId: string;
  uploadUrl: string;
}

export interface DownloadUrlResult {
  downloadUrl?: string;
  playbackUrl?: string;
  playbackId?: string;
  tokens?: {
    playbackToken: string;
    thumbnailToken: string;
    storyboardToken: string;
  };
  expiresIn: number;
}

export interface ShareLinkResult {
  shareUrl: string;
  shareToken: string;
  expiresAt: Date;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly db: DbService,
    private readonly config: ApiConfigService,
    private readonly r2: R2Service,
    private readonly mux: MuxService,
  ) {}

  /**
   * Initiate an R2 file upload.
   * Returns presigned URLs for direct upload to R2.
   */
  async initiateUpload(
    entryId: string,
    dto: InitiateUploadDto,
  ): Promise<UploadInitResult> {
    const multipartThreshold = this.config.get('MULTIPART_THRESHOLD_BYTES');
    const isMultipart = dto.sizeBytes > multipartThreshold;

    return this.db.rls(async (tx) => {
      // Verify entry exists and user has access (RLS will enforce ownership)
      const [entry] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.id, entryId));

      if (!entry) {
        throw new NotFoundException(`Entry with id ${entryId} not found`);
      }

      // Create file record
      const storageKey = this.generateStorageKey(entryId, dto.filename);
      const [file] = await tx
        .insert(files)
        .values({
          entryId,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          storageType: 'r2',
          storageKey,
          uploadStatus: 'pending',
        })
        .returning();

      const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

      if (isMultipart) {
        // Multipart upload for large files
        const uploadId = await this.r2.createMultipartUpload(
          storageKey,
          dto.mimeType,
        );
        const numParts = Math.ceil(dto.sizeBytes / PART_SIZE);
        const parts = await this.r2.getPartUploadUrls(
          storageKey,
          uploadId,
          numParts,
        );

        // Store uploadId in file record for completion
        await tx
          .update(files)
          .set({ uploadStatus: 'uploading' })
          .where(eq(files.id, file.id));

        return {
          fileId: file.id,
          uploadMethod: 'PUT' as const,
          expiresAt: expiresAt.toISOString(),
          uploadId,
          parts,
        };
      } else {
        // Single upload for smaller files
        const uploadUrl = await this.r2.createPresignedUploadUrl(
          storageKey,
          dto.mimeType,
        );

        return {
          fileId: file.id,
          uploadUrl,
          uploadMethod: 'PUT' as const,
          expiresAt: expiresAt.toISOString(),
        };
      }
    });
  }

  /**
   * Initiate a Mux video upload.
   * Returns a direct upload URL for uploading video to Mux.
   */
  async initiateVideoUpload(
    entryId: string,
    dto: InitiateUploadDto,
  ): Promise<VideoUploadInitResult> {
    return this.db.rls(async (tx) => {
      // Verify entry exists and user has access (RLS will enforce ownership)
      const [entry] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.id, entryId));

      if (!entry) {
        throw new NotFoundException(`Entry with id ${entryId} not found`);
      }

      // Create direct upload with Mux
      const { uploadUrl, uploadId } = await this.mux.createDirectUpload({
        meta: dto.meta,
        passthrough: dto.passthrough,
      });

      // Create file record
      const [file] = await tx
        .insert(files)
        .values({
          entryId,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          storageType: 'mux',
          storageKey: uploadId, // Store Mux upload ID
          uploadStatus: 'pending',
        })
        .returning();

      return {
        fileId: file.id,
        uploadUrl,
      };
    });
  }

  /**
   * Complete an upload after the client has finished uploading.
   * For R2 multipart uploads, this finalizes the upload.
   * For R2 single uploads and Mux, this marks the file as complete.
   */
  async completeUpload(fileId: string, dto: CompleteUploadDto): Promise<File> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneInTx(tx, fileId);

      if (file.uploadStatus === 'complete') {
        return file;
      }

      if (file.storageType === 'r2' && dto.parts && dto.parts.length > 0) {
        // Complete multipart upload
        if (!dto.uploadId) {
          throw new BadRequestException(
            'uploadId is required to complete multipart upload',
          );
        }
        await this.r2.completeMultipartUpload(
          file.storageKey,
          dto.uploadId,
          dto.parts,
        );
      }

      const [updated] = await tx
        .update(files)
        .set({ uploadStatus: 'complete', updatedAt: new Date() })
        .where(eq(files.id, fileId))
        .returning();

      return updated;
    });
  }

  /**
   * List files for an entry.
   */
  async findAllForEntry(entryId: string): Promise<File[]> {
    return this.db.rls(async (tx) => {
      return tx.select().from(files).where(eq(files.entryId, entryId));
    });
  }

  /**
   * Find files for multiple entries (batch fetch).
   * Used when including files in entry list responses.
   */
  async findByEntryIds(entryIds: string[]): Promise<File[]> {
    if (entryIds.length === 0) return [];

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(files)
        .where(inArray(files.entryId, entryIds))
        .orderBy(files.createdAt);
    });
  }

  /**
   * Convert files to response DTOs with presigned URLs.
   * Used when including files in entry responses.
   */
  async toFileResponses(fileList: File[]): Promise<FileResponseDto[]> {
    return Promise.all(fileList.map(async (file) => this.toFileResponse(file)));
  }

  /**
   * Convert a single file to response DTO with presigned URLs.
   */
  async toFileResponse(file: File): Promise<FileResponseDto> {
    // Only generate URLs for completed uploads
    if (file.uploadStatus !== 'complete') {
      return {
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageType: file.storageType as 'r2' | 'mux',
        uploadStatus: file.uploadStatus,
        downloadUrl: null,
        thumbnailUrl: null,
        playbackId: null,
        tokens: null,
      };
    }

    if (file.storageType === 'mux') {
      // Video file
      if (!file.muxPlaybackId) {
        return {
          id: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageType: 'mux',
          uploadStatus: file.uploadStatus,
          downloadUrl: null,
          thumbnailUrl: null,
          playbackId: null,
          tokens: null,
        };
      }

      try {
        const tokens = await this.mux.getSignedPlayerTokens(file.muxPlaybackId);
        return {
          id: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageType: 'mux',
          uploadStatus: file.uploadStatus,
          downloadUrl: null, // Videos don't have download URLs
          playbackId: file.muxPlaybackId,
          thumbnailUrl: `https://image.mux.com/${file.muxPlaybackId}/thumbnail.jpg?token=${tokens.thumbnailToken}`,
          tokens,
        };
      } catch (e) {
        this.logger.error('Mux signing failed', e);
        // Mux not configured or signing failed
        return {
          id: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageType: 'mux',
          uploadStatus: file.uploadStatus,
          downloadUrl: null,
          thumbnailUrl: null,
          playbackId: file.muxPlaybackId,
          tokens: null,
        };
      }
    }

    // R2 file
    try {
      const downloadUrl = await this.r2.createPresignedDownloadUrl(
        file.storageKey,
        3600,
      );
      return {
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageType: 'r2',
        uploadStatus: file.uploadStatus,
        downloadUrl,
        // Use same URL for image thumbnails
        thumbnailUrl: file.mimeType.startsWith('image/') ? downloadUrl : null,
        playbackId: null,
        tokens: null,
      };
    } catch {
      // R2 not configured
      return {
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageType: 'r2',
        uploadStatus: file.uploadStatus,
        downloadUrl: null,
        thumbnailUrl: null,
        playbackId: null,
        tokens: null,
      };
    }
  }

  /**
   * Find a single file by ID.
   */
  async findOne(id: string): Promise<File> {
    return this.db.rls(async (tx) => {
      return this.findOneInTx(tx, id);
    });
  }

  private async findOneInTx(tx: DrizzleTransaction, id: string): Promise<File> {
    const [file] = await tx.select().from(files).where(eq(files.id, id));

    if (!file) {
      throw new NotFoundException(`File with id ${id} not found`);
    }

    return file;
  }

  /**
   * Get a download/playback URL for a file.
   */
  async getDownloadUrl(id: string): Promise<DownloadUrlResult> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneInTx(tx, id);

      if (file.uploadStatus !== 'complete') {
        throw new BadRequestException('File upload is not complete');
      }

      if (file.storageType === 'r2') {
        const downloadUrl = await this.r2.createPresignedDownloadUrl(
          file.storageKey,
        );
        return { downloadUrl, expiresIn: 3600 };
      } else if (file.storageType === 'mux') {
        if (!file.muxPlaybackId) {
          throw new BadRequestException('Video is not ready for playback');
        }

        const playbackUrl = await this.mux.getSignedPlaybackUrl(
          file.muxPlaybackId,
        );
        const tokens = await this.mux.getSignedPlayerTokens(file.muxPlaybackId);

        return {
          playbackUrl,
          playbackId: file.muxPlaybackId,
          tokens,
          expiresIn: 604800, // 7 days
        };
      }

      throw new BadRequestException('Unknown storage type');
    });
  }

  /**
   * Create a shareable link for a file.
   */
  async createShareLink(
    id: string,
    dto: CreateShareLinkDto,
  ): Promise<ShareLinkResult> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneInTx(tx, id);

      if (file.uploadStatus !== 'complete') {
        throw new BadRequestException('File upload is not complete');
      }

      const shareToken = randomBytes(32).toString('base64url');
      const shareExpiresAt = new Date(
        Date.now() + dto.expiresInHours * 60 * 60 * 1000,
      );

      await tx
        .update(files)
        .set({
          accessLevel: 'shareable',
          shareToken,
          shareExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(files.id, id));

      return {
        shareUrl: `/files/share/${shareToken}`,
        shareToken,
        expiresAt: shareExpiresAt,
      };
    });
  }

  /**
   * Revoke a shareable link for a file.
   */
  async revokeShareLink(id: string): Promise<File> {
    return this.db.rls(async (tx) => {
      await this.findOneInTx(tx, id);

      const [updated] = await tx
        .update(files)
        .set({
          accessLevel: 'private',
          shareToken: null,
          shareExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(files.id, id))
        .returning();

      return updated;
    });
  }

  /**
   * Access a file via share token (public endpoint).
   * Uses bypassRls since this is an unauthenticated request.
   */
  async accessSharedFile(token: string): Promise<DownloadUrlResult> {
    return this.db.bypassRls(async (tx) => {
      const [file] = await tx
        .select()
        .from(files)
        .where(
          and(eq(files.shareToken, token), eq(files.accessLevel, 'shareable')),
        );

      if (!file) {
        throw new NotFoundException('Share link not found or expired');
      }

      if (!file.shareExpiresAt || file.shareExpiresAt < new Date()) {
        throw new NotFoundException('Share link not found or expired');
      }

      if (file.storageType === 'r2') {
        const downloadUrl = await this.r2.createPresignedDownloadUrl(
          file.storageKey,
        );
        return { downloadUrl, expiresIn: 3600 };
      } else if (file.storageType === 'mux') {
        if (!file.muxPlaybackId) {
          throw new BadRequestException('Video is not ready for playback');
        }

        const playbackUrl = await this.mux.getSignedPlaybackUrl(
          file.muxPlaybackId,
        );
        const tokens = await this.mux.getSignedPlayerTokens(file.muxPlaybackId);

        return {
          playbackUrl,
          playbackId: file.muxPlaybackId,
          tokens,
          expiresIn: 604800,
        };
      }

      throw new BadRequestException('Unknown storage type');
    });
  }

  /**
   * Delete a file.
   * Also deletes the file from R2 or Mux.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneInTx(tx, id);

      // Delete from storage
      try {
        if (file.storageType === 'r2') {
          await this.r2.deleteObject(file.storageKey);
        } else if (file.storageType === 'mux' && file.muxAssetId) {
          await this.mux.deleteAsset(file.muxAssetId);
        }
      } catch (error) {
        // Log but don't fail - the DB record should still be deleted
        this.logger.error('Failed to delete file from storage', error);
      }

      await tx.delete(files).where(eq(files.id, id));
      return { deleted: true };
    });
  }

  /**
   * Handle Mux webhook events.
   * Updates file status when video processing completes.
   */
  async handleMuxWebhook(event: {
    type: string;
    data: {
      id: string;
      playback_ids?: Array<{ id: string }>;
      upload_id?: string;
    };
  }): Promise<void> {
    if (event.type === 'video.asset.ready') {
      const assetId = event.data.id;
      const playbackId = event.data.playback_ids?.[0]?.id;

      if (!playbackId) {
        this.logger.error(`Mux asset ready but no playback ID: ${assetId}`);
        return;
      }

      // Find file by Mux upload ID (stored in storageKey)
      // We need to use bypassRls since webhooks don't have user context
      await this.db.bypassRls(async (tx) => {
        // Find files that are pending and match this asset
        const pendingFiles = await tx
          .select()
          .from(files)
          .where(
            and(
              eq(files.storageType, 'mux'),
              eq(files.uploadStatus, 'pending'),
            ),
          );

        for (const file of pendingFiles) {
          // Check if this file's upload created this asset
          try {
            const upload = await this.mux.getUpload(file.storageKey);
            if (upload.assetId === assetId) {
              await tx
                .update(files)
                .set({
                  uploadStatus: 'complete',
                  muxAssetId: assetId,
                  muxPlaybackId: playbackId,
                  updatedAt: new Date(),
                })
                .where(eq(files.id, file.id));
              break;
            }
          } catch {
            // Upload may not exist or be accessible
          }
        }
      });
    } else if (event.type === 'video.asset.errored') {
      const assetId = event.data.id;

      await this.db.bypassRls(async (tx) => {
        const pendingFiles = await tx
          .select()
          .from(files)
          .where(eq(files.storageType, 'mux'));

        for (const file of pendingFiles) {
          try {
            const upload = await this.mux.getUpload(file.storageKey);
            if (upload.assetId === assetId) {
              await tx
                .update(files)
                .set({
                  uploadStatus: 'failed',
                  muxAssetId: assetId,
                  updatedAt: new Date(),
                })
                .where(eq(files.id, file.id));
              break;
            }
          } catch {
            // Upload may not exist
          }
        }
      });
    }
  }

  /**
   * Generate a unique storage key for a file.
   */
  private generateStorageKey(entryId: string, filename: string): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    return `entries/${entryId}/${timestamp}-${random}${ext ? `.${ext}` : ''}`;
  }
}
