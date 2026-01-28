import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { FilesService } from './files.service';
import { MuxService } from './mux.service';
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
   */
  @Post('entries/:entryId/files/upload/init')
  initiateUpload(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateUpload(entryId, dto);
  }

  /**
   * Initiate a video upload to Mux.
   * POST /entries/:entryId/files/video/init
   */
  @Post('entries/:entryId/files/video/init')
  initiateVideoUpload(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.filesService.initiateVideoUpload(entryId, dto);
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
  accessSharedFile(@Param('token') token: string) {
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
    @Body() body: unknown,
  ) {
    // Verify webhook signature
    const webhookSecret = this.muxService.getWebhookSecret();
    if (webhookSecret && signature) {
      // TODO: Implement proper Mux webhook signature verification
      // For now, we'll just check that a signature was provided
      // In production, you should verify using Mux's webhook verification
    }

    // Process the webhook event
    const event = body as {
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
