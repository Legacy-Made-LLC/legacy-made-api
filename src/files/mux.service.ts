import { Injectable } from '@nestjs/common';
import Mux from '@mux/mux-node';
import { ApiConfigService } from 'src/config/api-config.service';

export interface DirectUploadResult {
  uploadUrl: string;
  uploadId: string;
}

export interface MuxAsset {
  id: string;
  status: string;
  playbackId?: string;
  duration?: number;
}

@Injectable()
export class MuxService {
  private readonly client: Mux;

  constructor(private readonly config: ApiConfigService) {
    this.client = new Mux({
      tokenId: this.config.get('MUX_TOKEN_ID'),
      tokenSecret: this.config.get('MUX_TOKEN_SECRET'),
      jwtSigningKey: this.config.get('MUX_SIGNING_KEY_ID'),
      jwtPrivateKey: this.config.get('MUX_SIGNING_KEY_SECRET'),
      webhookSecret: this.config.get('MUX_WEBHOOK_SECRET'),
    });
  }

  /**
   * Create a direct upload URL for the client to upload video directly to Mux.
   * Returns the upload URL and upload ID.
   */
  async createDirectUpload(options?: {
    meta?: { externalId?: string; creatorId?: string; title?: string };
    passthrough?: string;
  }): Promise<DirectUploadResult> {
    // Use first configured CORS origin, or fall back to '*' for development
    const allowedOrigins = this.config.get('CORS_ALLOWED_ORIGINS');
    const corsOrigin =
      allowedOrigins.length > 0 && allowedOrigins[0] !== ''
        ? allowedOrigins[0]
        : '*';

    const upload = await this.client.video.uploads.create({
      new_asset_settings: {
        playback_policies: ['signed'],
        video_quality: 'basic',
        meta: options?.meta
          ? {
              external_id: options.meta.externalId,
              creator_id: options.meta.creatorId,
              title: options.meta.title,
            }
          : undefined,
        passthrough: options?.passthrough,
      },
      cors_origin: corsOrigin,
    });

    if (!upload.url || !upload.id) {
      throw new Error('Failed to create Mux direct upload');
    }

    return {
      uploadUrl: upload.url,
      uploadId: upload.id,
    };
  }

  /**
   * Retrieve an upload to check its status and get the asset ID.
   */
  async getUpload(uploadId: string): Promise<{
    status: string;
    assetId?: string;
  }> {
    const upload = await this.client.video.uploads.retrieve(uploadId);
    return {
      status: upload.status ?? 'unknown',
      assetId: upload.asset_id ?? undefined,
    };
  }

  /**
   * Retrieve an asset to check its status and get playback info.
   */
  async getAsset(assetId: string): Promise<MuxAsset> {
    const asset = await this.client.video.assets.retrieve(assetId);
    const playbackId = asset.playback_ids?.[0]?.id;

    return {
      id: asset.id,
      status: asset.status ?? 'unknown',
      playbackId,
      duration: asset.duration ?? undefined,
    };
  }

  /**
   * Generate a signed playback URL for secure video streaming.
   */
  async getSignedPlaybackUrl(
    playbackId: string,
    expiresIn = '7d',
  ): Promise<string> {
    const token = await this.client.jwt.signPlaybackId(playbackId, {
      expiration: expiresIn,
      type: 'video',
    });

    return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
  }

  /**
   * Generate signed tokens for Mux Player (playback, thumbnail, storyboard).
   */
  async getSignedPlayerTokens(
    playbackId: string,
    expiresIn = '7d',
  ): Promise<{
    playbackToken: string;
    thumbnailToken: string;
    storyboardToken: string;
  }> {
    const [playbackToken, thumbnailToken, storyboardToken] = await Promise.all([
      this.client.jwt.signPlaybackId(playbackId, {
        expiration: expiresIn,
        type: 'video',
      }),
      this.client.jwt.signPlaybackId(playbackId, {
        expiration: expiresIn,
        type: 'thumbnail',
      }),
      this.client.jwt.signPlaybackId(playbackId, {
        expiration: expiresIn,
        type: 'storyboard',
      }),
    ]);

    return { playbackToken, thumbnailToken, storyboardToken };
  }

  /**
   * Delete an asset from Mux.
   */
  async deleteAsset(assetId: string): Promise<void> {
    await this.client.video.assets.delete(assetId);
  }

  /**
   * Cancel a pending upload.
   */
  async cancelUpload(uploadId: string): Promise<void> {
    await this.client.video.uploads.cancel(uploadId);
  }

  /**
   * Verify the signature of a webhook event.
   * This method raises an error if the signature is invalid.
   *
   * @param body - The body of the webhook event.
   * @param signature - The signature of the webhook event.
   */
  verifyWebhookSignature(body: string, signature: string) {
    const secret = this.config.get('MUX_WEBHOOK_SECRET');
    // Raises an error if the signature is invalid.
    this.client.webhooks.verifySignature(
      body,
      {
        'mux-signature': signature,
      },
      secret,
    );
  }
}
