import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  RawBody,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/auth.guard';
import {
  EntitlementsGuard,
  RequiresQuota,
} from '../entitlements/entitlements.guard';
import { FilesService } from './files.service';
import { MuxService } from './mux.service';
import { ShareTokenPipe } from './share-token.pipe';
import {
  InitiateUploadDto,
  CompleteUploadDto,
  CreateShareLinkDto,
} from './dto';

@Controller()
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly muxService: MuxService,
  ) {}

  // =========================================================================
  // Entry-scoped endpoints
  // =========================================================================

  /**
   * Initiate a file upload to R2.
   * POST /entries/:entryId/files/upload/init
   *
   * Rate limited: 3 requests/second, 20 requests/minute
   *
   * Quota enforcement happens at two levels:
   * 1. Guard level (@RequiresQuota): Early rejection if user has zero quota
   *    remaining (e.g., free tier or already at capacity). This check only
   *    verifies current < limit, not whether the specific file fits.
   * 2. Service level (requireFileSizeQuotaInTx): Precise check that the
   *    specific file size fits within remaining quota, done within the
   *    same transaction as file record creation.
   */
  @Post('entries/:entryId/files/upload/init')
  @UseGuards(ThrottlerGuard, EntitlementsGuard)
  @RequiresQuota('storage_mb')
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  initiateEntryUpload(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateUpload(
      { type: 'entry', id: entryId },
      dto,
    );
  }

  /**
   * Initiate a video upload to Mux.
   * POST /entries/:entryId/files/video/init
   *
   * Rate limited: 3 requests/second, 20 requests/minute
   *
   * Quota enforcement: See initiateEntryUpload() for details on the two-level
   * quota check (guard for early rejection, service for precise enforcement).
   */
  @Post('entries/:entryId/files/video/init')
  @UseGuards(ThrottlerGuard, EntitlementsGuard)
  @RequiresQuota('storage_mb')
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  initiateEntryVideoUpload(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateVideoUpload(
      { type: 'entry', id: entryId },
      dto,
    );
  }

  /**
   * List all files for an entry.
   * GET /entries/:entryId/files
   */
  @Get('entries/:entryId/files')
  findAllForEntry(@Param('entryId', ParseUUIDPipe) entryId: string) {
    return this.filesService.findAllForEntry(entryId);
  }

  // =========================================================================
  // Wish-scoped endpoints
  // =========================================================================

  /**
   * Initiate a file upload to R2 for a wish.
   * POST /wishes/:wishId/files/upload/init
   *
   * Rate limited: 3 requests/second, 20 requests/minute
   *
   * Quota enforcement happens at two levels:
   * 1. Guard level (@RequiresQuota): Early rejection if user has zero quota
   *    remaining (e.g., free tier or already at capacity).
   * 2. Service level (requireFileSizeQuotaInTx): Precise check that the
   *    specific file size fits within remaining quota.
   */
  @Post('wishes/:wishId/files/upload/init')
  @UseGuards(ThrottlerGuard, EntitlementsGuard)
  @RequiresQuota('storage_mb')
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  initiateWishUpload(
    @Param('wishId', ParseUUIDPipe) wishId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateUpload({ type: 'wish', id: wishId }, dto);
  }

  /**
   * Initiate a video upload to Mux for a wish.
   * POST /wishes/:wishId/files/video/init
   *
   * Rate limited: 3 requests/second, 20 requests/minute
   *
   * Quota enforcement: See initiateWishUpload() for details.
   */
  @Post('wishes/:wishId/files/video/init')
  @UseGuards(ThrottlerGuard, EntitlementsGuard)
  @RequiresQuota('storage_mb')
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  initiateWishVideoUpload(
    @Param('wishId', ParseUUIDPipe) wishId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateVideoUpload(
      { type: 'wish', id: wishId },
      dto,
    );
  }

  /**
   * List all files for a wish.
   * GET /wishes/:wishId/files
   */
  @Get('wishes/:wishId/files')
  findAllForWish(@Param('wishId', ParseUUIDPipe) wishId: string) {
    return this.filesService.findAllForWish(wishId);
  }

  // =========================================================================
  // File-scoped endpoints
  // =========================================================================

  /**
   * Complete a file upload.
   * POST /files/:id/complete
   */
  @Post('files/:id/complete')
  completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.filesService.completeUpload(id, dto);
  }

  /**
   * Get file metadata.
   * GET /files/:id
   */
  @Get('files/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.findOne(id);
  }

  /**
   * Get a download/playback URL for a file.
   * GET /files/:id/download
   */
  @Get('files/:id/download')
  getDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.getDownloadUrl(id);
  }

  /**
   * Create a shareable link for a file.
   * POST /files/:id/share
   */
  @Post('files/:id/share')
  createShareLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.filesService.createShareLink(id, dto);
  }

  /**
   * Revoke a shareable link for a file.
   * DELETE /files/:id/share
   */
  @Delete('files/:id/share')
  revokeShareLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.revokeShareLink(id);
  }

  /**
   * Delete a file.
   * DELETE /files/:id
   */
  @Delete('files/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.remove(id);
  }

  // =========================================================================
  // Public endpoints (no auth required)
  // =========================================================================

  /**
   * Access a shared file via token.
   * GET /files/share/:token
   */
  @Get('files/share/:token')
  @Public()
  accessSharedFile(@Param('token', ShareTokenPipe) token: string) {
    return this.filesService.accessSharedFile(token);
  }

  /**
   * Handle Mux webhook events.
   * POST /webhooks/mux
   */
  @Post('webhooks/mux')
  @Public()
  async handleMuxWebhook(
    @Headers('mux-signature') signature: string,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    const body = rawBody?.toString() ?? '';
    // Verify webhook signature
    if (!signature) {
      throw new BadRequestException('Missing Mux webhook signature');
    }

    try {
      this.muxService.verifyWebhookSignature(body, signature);
    } catch {
      throw new BadRequestException('Invalid Mux webhook signature');
    }

    // Process the webhook event
    const event = JSON.parse(body) as {
      type: string;
      data: {
        id: string;
        playback_ids?: Array<{ id: string }>;
        upload_id?: string;
      };
    };

    await this.filesService.handleMuxWebhook(event);

    return { received: true };
  }
}
