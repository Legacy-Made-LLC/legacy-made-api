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
import { EntitlementsService } from '../entitlements/entitlements.service';
import { files, File, entries, wishes, messages } from '../schema';
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

/**
 * Discriminated union for file parent reference.
 * Files can be attached to an entry, wish, or message.
 */
export type FileParent =
  | { type: 'entry'; id: string }
  | { type: 'wish'; id: string }
  | { type: 'message'; id: string };

type PillarType = 'important_info' | 'wishes' | 'messages';

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
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Initiate an R2 file upload for an entry, wish, or message.
   * Returns presigned URLs for direct upload to R2.
   */
  async initiateUpload(
    parent: FileParent,
    dto: InitiateUploadDto,
  ): Promise<UploadInitResult> {
    const multipartThreshold = this.config.get('MULTIPART_THRESHOLD_BYTES');
    const isMultipart = dto.sizeBytes > multipartThreshold;

    return this.db.rls(async (tx) => {
      // Verify parent exists and user has access (RLS will enforce ownership)
      await this.verifyParentExists(tx, parent);

      // Verify storage quota is sufficient for this specific file size.
      // This is the authoritative check - the controller's @RequiresQuota guard
      // only checks if any space remains (current < limit), while this checks
      // if the specific file fits (current + fileSize <= limit). Both checks
      // happen to provide early rejection at the guard level and precise
      // enforcement here within the same transaction as file creation.
      await this.entitlements.requireFileSizeQuotaInTx(tx, dto.sizeBytes);

      // Validate parent file if provided and inherit its pillar FK
      let parentFileId: string | null = null;
      if (dto.parentFileId) {
        const [parentFile] = await tx
          .select({
            id: files.id,
            entryId: files.entryId,
            wishId: files.wishId,
            messageId: files.messageId,
          })
          .from(files)
          .where(eq(files.id, dto.parentFileId));

        if (!parentFile) {
          throw new NotFoundException('Parent file not found');
        }

        // Verify the parent file belongs to the same pillar parent
        const parentPillarId =
          parentFile.entryId ?? parentFile.wishId ?? parentFile.messageId;
        if (parentPillarId !== parent.id) {
          throw new BadRequestException(
            'Parent file must belong to the same entry/wish/message',
          );
        }

        parentFileId = parentFile.id;
      }

      // Create file record
      const storageKey = this.generateStorageKey(parent, dto.filename);
      const [file] = (await tx
        .insert(files)
        .values({
          entryId: parent.type === 'entry' ? parent.id : undefined,
          wishId: parent.type === 'wish' ? parent.id : undefined,
          messageId: parent.type === 'message' ? parent.id : undefined,
          role: dto.role,
          parentFileId,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          storageType: 'r2',
          storageKey,
          uploadStatus: 'pending',
        })
        .returning()) as File[];

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
   * Initiate a Mux video upload for an entry, wish, or message.
   * Returns a direct upload URL for uploading video to Mux.
   */
  async initiateVideoUpload(
    parent: FileParent,
    dto: InitiateUploadDto,
  ): Promise<VideoUploadInitResult> {
    return this.db.rls(async (tx) => {
      // Verify parent exists and user has access (RLS will enforce ownership)
      await this.verifyParentExists(tx, parent);

      // Verify storage quota is sufficient for this specific file size.
      // See initiateUpload() for details on the two-level quota enforcement.
      await this.entitlements.requireFileSizeQuotaInTx(tx, dto.sizeBytes);

      // Create file record first to get the ID for passthrough
      const [file] = (await tx
        .insert(files)
        .values({
          entryId: parent.type === 'entry' ? parent.id : undefined,
          wishId: parent.type === 'wish' ? parent.id : undefined,
          messageId: parent.type === 'message' ? parent.id : undefined,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          storageType: 'mux',
          storageKey: '', // Will be updated after Mux upload creation
          uploadStatus: 'pending',
        })
        .returning()) as File[];

      // Create direct upload with Mux, including file ID in passthrough for webhook lookup
      const passthroughData = JSON.stringify({
        fileId: file.id,
        userPassthrough: dto.passthrough,
      });

      const { uploadUrl, uploadId } = await this.mux.createDirectUpload({
        meta: dto.meta,
        passthrough: passthroughData,
      });

      // Update file record with Mux upload ID
      await tx
        .update(files)
        .set({ storageKey: uploadId })
        .where(eq(files.id, file.id));

      return {
        fileId: file.id,
        uploadUrl,
      };
    });
  }

  /**
   * Verify that a parent (entry, wish, or message) exists.
   * RLS will enforce ownership.
   */
  private async verifyParentExists(
    tx: DrizzleTransaction,
    parent: FileParent,
  ): Promise<void> {
    if (parent.type === 'entry') {
      const [entry] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.id, parent.id));

      if (!entry) {
        throw new NotFoundException(`Entry with id ${parent.id} not found`);
      }
    } else if (parent.type === 'wish') {
      const [wish] = await tx
        .select({ id: wishes.id })
        .from(wishes)
        .where(eq(wishes.id, parent.id));

      if (!wish) {
        throw new NotFoundException(`Wish with id ${parent.id} not found`);
      }
    } else {
      const [message] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.id, parent.id));

      if (!message) {
        throw new NotFoundException(`Message with id ${parent.id} not found`);
      }
    }
  }

  /**
   * Complete an upload after the client has finished uploading.
   * For R2 multipart uploads, this finalizes the upload.
   * For R2 single uploads and Mux, this marks the file as complete.
   *
   * Returns the file with signed URLs for immediate access.
   */
  async completeUpload(
    fileId: string,
    dto: CompleteUploadDto,
  ): Promise<FileResponseDto> {
    const file = await this.db.rls(async (tx) => {
      const existingFile = await this.findOneWithPillarCheck(
        tx,
        fileId,
        'modify',
      );

      if (existingFile.uploadStatus === 'complete') {
        return existingFile;
      }

      if (
        existingFile.storageType === 'r2' &&
        dto.parts &&
        dto.parts.length > 0
      ) {
        // Complete multipart upload
        if (!dto.uploadId) {
          throw new BadRequestException(
            'uploadId is required to complete multipart upload',
          );
        }
        await this.r2.completeMultipartUpload(
          existingFile.storageKey,
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

    return this.toFileResponse(file);
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
   * List files for a wish.
   */
  async findAllForWish(wishId: string): Promise<File[]> {
    return this.db.rls(async (tx) => {
      return tx.select().from(files).where(eq(files.wishId, wishId));
    });
  }

  /**
   * Find files for multiple wishes (batch fetch).
   * Used when including files in wish list responses.
   */
  async findByWishIds(wishIds: string[]): Promise<File[]> {
    if (wishIds.length === 0) return [];

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(files)
        .where(inArray(files.wishId, wishIds))
        .orderBy(files.createdAt);
    });
  }

  /**
   * List files for a message.
   */
  async findAllForMessage(messageId: string): Promise<File[]> {
    return this.db.rls(async (tx) => {
      return tx.select().from(files).where(eq(files.messageId, messageId));
    });
  }

  /**
   * Find files for multiple messages (batch fetch).
   * Used when including files in message list responses.
   */
  async findByMessageIds(messageIds: string[]): Promise<File[]> {
    if (messageIds.length === 0) return [];

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(files)
        .where(inArray(files.messageId, messageIds))
        .orderBy(files.createdAt);
    });
  }

  /**
   * Convert files to response DTOs with presigned URLs.
   * Used when including files in entry, wish, or message responses.
   */
  async toFileResponses(fileList: File[]): Promise<FileResponseDto[]> {
    return Promise.all(fileList.map(async (file) => this.toFileResponse(file)));
  }

  /**
   * Convert a single file to response DTO with presigned URLs.
   */
  async toFileResponse(file: File): Promise<FileResponseDto> {
    const base = {
      id: file.id,
      role: file.role,
      parentFileId: file.parentFileId,
    };

    // Only generate URLs for completed uploads
    if (file.uploadStatus !== 'complete') {
      return {
        ...base,
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
          ...base,
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
          ...base,
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
          ...base,
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
        ...base,
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
        ...base,
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
   * Checks pillar view access based on file's parent.
   */
  async findOne(id: string): Promise<File> {
    return this.db.rls(async (tx) => {
      return this.findOneWithPillarCheck(tx, id, 'view');
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
   * Determine which pillar a file belongs to based on its parent.
   */
  private getFilePillar(file: File): PillarType {
    if (file.entryId) return 'important_info';
    if (file.wishId) return 'wishes';
    if (file.messageId) return 'messages';
    return 'wishes';
  }

  /**
   * Find a file and verify pillar access.
   * Used by file-scoped endpoints that need to check entitlements.
   */
  private async findOneWithPillarCheck(
    tx: DrizzleTransaction,
    id: string,
    access: 'view' | 'modify',
  ): Promise<File> {
    const file = await this.findOneInTx(tx, id);
    const pillar = this.getFilePillar(file);

    if (access === 'view') {
      await this.entitlements.requireViewPillarAccessInTx(tx, pillar);
    } else {
      await this.entitlements.requirePillarAccessInTx(tx, pillar);
    }

    return file;
  }

  /**
   * Get a download/playback URL for a file.
   * Checks pillar view access based on file's parent.
   */
  async getDownloadUrl(id: string): Promise<DownloadUrlResult> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneWithPillarCheck(tx, id, 'view');

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
   * Checks pillar modify access based on file's parent.
   */
  async createShareLink(
    id: string,
    dto: CreateShareLinkDto,
  ): Promise<ShareLinkResult> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneWithPillarCheck(tx, id, 'modify');

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
   * Checks pillar modify access based on file's parent.
   */
  async revokeShareLink(id: string): Promise<File> {
    return this.db.rls(async (tx) => {
      await this.findOneWithPillarCheck(tx, id, 'modify');

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
   * Checks pillar modify access based on file's parent.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    return this.db.rls(async (tx) => {
      const file = await this.findOneWithPillarCheck(tx, id, 'modify');

      // Find child files that will be cascade-deleted so we can clean up their storage
      const childFiles = await tx
        .select()
        .from(files)
        .where(eq(files.parentFileId, id));

      // Delete all related files from storage (parent + children) in parallel
      const results = await Promise.allSettled(
        [file, ...childFiles].map(async (f) => {
          if (f.storageType === 'r2') {
            await this.r2.deleteObject(f.storageKey);
          } else if (f.storageType === 'mux' && f.muxAssetId) {
            await this.mux.deleteAsset(f.muxAssetId);
          }
        }),
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.error('Failed to delete file from storage', result.reason);
        }
      }

      // DB cascade will also delete child file records
      await tx.delete(files).where(eq(files.id, id));
      return { deleted: true };
    });
  }

  /**
   * Handle Mux webhook events.
   * Updates file status when video processing completes.
   * Uses passthrough data for O(1) file lookup instead of iterating all files.
   */
  async handleMuxWebhook(event: {
    type: string;
    data: {
      id: string;
      playback_ids?: Array<{ id: string }>;
      upload_id?: string;
      passthrough?: string;
    };
  }): Promise<void> {
    // Try to extract file ID from passthrough data
    let fileId: string | undefined;
    if (event.data.passthrough) {
      try {
        const passthroughData = JSON.parse(event.data.passthrough);
        fileId = passthroughData.fileId;
      } catch {
        // Passthrough is not JSON or doesn't have fileId
        this.logger.warn('Could not parse passthrough data from Mux webhook');
      }
    }

    if (event.type === 'video.asset.ready') {
      const assetId = event.data.id;
      const playbackId = event.data.playback_ids?.[0]?.id;

      if (!playbackId) {
        this.logger.error(`Mux asset ready but no playback ID: ${assetId}`);
        return;
      }

      await this.db.bypassRls(async (tx) => {
        if (fileId) {
          // Direct lookup using file ID from passthrough (O(1))
          await tx
            .update(files)
            .set({
              uploadStatus: 'complete',
              muxAssetId: assetId,
              muxPlaybackId: playbackId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(files.id, fileId),
                eq(files.storageType, 'mux'),
                eq(files.uploadStatus, 'pending'),
              ),
            );
        } else {
          // Fallback: lookup by upload_id if passthrough not available
          if (event.data.upload_id) {
            await tx
              .update(files)
              .set({
                uploadStatus: 'complete',
                muxAssetId: assetId,
                muxPlaybackId: playbackId,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(files.storageKey, event.data.upload_id),
                  eq(files.storageType, 'mux'),
                  eq(files.uploadStatus, 'pending'),
                ),
              );
          } else {
            this.logger.error(
              `Mux webhook missing both passthrough and upload_id for asset: ${assetId}`,
            );
          }
        }
      });
    } else if (event.type === 'video.asset.errored') {
      const assetId = event.data.id;

      await this.db.bypassRls(async (tx) => {
        if (fileId) {
          // Direct lookup using file ID from passthrough (O(1))
          await tx
            .update(files)
            .set({
              uploadStatus: 'failed',
              muxAssetId: assetId,
              updatedAt: new Date(),
            })
            .where(and(eq(files.id, fileId), eq(files.storageType, 'mux')));
        } else if (event.data.upload_id) {
          // Fallback: lookup by upload_id
          await tx
            .update(files)
            .set({
              uploadStatus: 'failed',
              muxAssetId: assetId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(files.storageKey, event.data.upload_id),
                eq(files.storageType, 'mux'),
              ),
            );
        } else {
          this.logger.error(
            `Mux webhook missing both passthrough and upload_id for errored asset: ${assetId}`,
          );
        }
      });
    }
  }

  /**
   * Generate a unique storage key for a file.
   * Path format: {entries|wishes|messages}/{parentId}/{timestamp}-{random}.{ext}
   */
  private generateStorageKey(parent: FileParent, filename: string): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const prefixMap: Record<FileParent['type'], string> = {
      entry: 'entries',
      wish: 'wishes',
      message: 'messages',
    };
    const prefix = prefixMap[parent.type];
    return `${prefix}/${parent.id}/${timestamp}-${random}${ext ? `.${ext}` : ''}`;
  }
}
