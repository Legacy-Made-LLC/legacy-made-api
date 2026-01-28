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
  private readonly signingKeyId: string;
  private readonly signingKeySecret: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ApiConfigService) {
    this.client = new Mux({
      tokenId: this.config.get('MUX_TOKEN_ID'),
      tokenSecret: this.config.get('MUX_TOKEN_SECRET'),
    });
    this.signingKeyId = this.config.get('MUX_SIGNING_KEY_ID');
    this.signingKeySecret = this.config.get('MUX_SIGNING_KEY_SECRET');
    this.webhookSecret = this.config.get('MUX_WEBHOOK_SECRET');
  }

  /**
   * Create a direct upload URL for the client to upload video directly to Mux.
   * Returns the upload URL and upload ID.
   */
  async createDirectUpload(corsOrigin?: string): Promise<DirectUploadResult> {
    const upload = await this.client.video.uploads.create({
      new_asset_settings: {
        playback_policy: ['signed'],
        encoding_tier: 'baseline',
      },
      cors_origin: corsOrigin || '*',
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
    // The SDK uses environment variables by default for signing:
    // MUX_SIGNING_KEY and MUX_PRIVATE_KEY
    // We need to set them temporarily or pass them explicitly
    const originalSigningKey = process.env.MUX_SIGNING_KEY;
    const originalPrivateKey = process.env.MUX_PRIVATE_KEY;

    try {
      process.env.MUX_SIGNING_KEY = this.signingKeyId;
      process.env.MUX_PRIVATE_KEY = this.signingKeySecret;

      const token = await this.client.jwt.signPlaybackId(playbackId, {
        expiration: expiresIn,
        type: 'video',
      });

      return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    } finally {
      // Restore original env vars
      if (originalSigningKey !== undefined) {
        process.env.MUX_SIGNING_KEY = originalSigningKey;
      } else {
        delete process.env.MUX_SIGNING_KEY;
      }
      if (originalPrivateKey !== undefined) {
        process.env.MUX_PRIVATE_KEY = originalPrivateKey;
      } else {
        delete process.env.MUX_PRIVATE_KEY;
      }
    }
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
    const originalSigningKey = process.env.MUX_SIGNING_KEY;
    const originalPrivateKey = process.env.MUX_PRIVATE_KEY;

    try {
      process.env.MUX_SIGNING_KEY = this.signingKeyId;
      process.env.MUX_PRIVATE_KEY = this.signingKeySecret;

      const [playbackToken, thumbnailToken, storyboardToken] =
        await Promise.all([
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
    } finally {
      if (originalSigningKey !== undefined) {
        process.env.MUX_SIGNING_KEY = originalSigningKey;
      } else {
        delete process.env.MUX_SIGNING_KEY;
      }
      if (originalPrivateKey !== undefined) {
        process.env.MUX_PRIVATE_KEY = originalPrivateKey;
      } else {
        delete process.env.MUX_PRIVATE_KEY;
      }
    }
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
   * Get the webhook secret for signature verification.
   */
  getWebhookSecret(): string {
    return this.webhookSecret;
  }
}
