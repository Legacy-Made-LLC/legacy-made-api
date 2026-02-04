import { Test, TestingModule } from '@nestjs/testing';
import { MuxService } from './mux.service';
import { ApiConfigService } from '../config/api-config.service';
import Mux from '@mux/mux-node';

// Mock the Mux SDK
jest.mock('@mux/mux-node');

describe('MuxService', () => {
  let service: MuxService;
  let mockMuxClient: any;

  const mockConfig: Record<string, string | string[]> = {
    MUX_TOKEN_ID: 'test-token-id',
    MUX_TOKEN_SECRET: 'test-token-secret',
    MUX_SIGNING_KEY_ID: 'test-signing-key-id',
    MUX_SIGNING_KEY_SECRET: btoa('test-private-key'), // Base64 encoded
    MUX_WEBHOOK_SECRET: 'test-webhook-secret',
    CORS_ALLOWED_ORIGINS: [], // Empty array defaults to '*'
  };

  const mockApiConfigService = {
    get: jest.fn((key: string) => mockConfig[key]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock Mux client methods
    mockMuxClient = {
      video: {
        uploads: {
          create: jest.fn(),
          retrieve: jest.fn(),
          cancel: jest.fn(),
        },
        assets: {
          retrieve: jest.fn(),
          delete: jest.fn(),
        },
      },
      jwt: {
        signPlaybackId: jest.fn(),
      },
      webhooks: {
        verifySignature: jest.fn(),
      },
    };

    // Mock Mux constructor
    (Mux as unknown as jest.Mock).mockImplementation(() => mockMuxClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MuxService,
        {
          provide: ApiConfigService,
          useValue: mockApiConfigService,
        },
      ],
    }).compile();

    service = module.get<MuxService>(MuxService);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.MUX_SIGNING_KEY;
    delete process.env.MUX_PRIVATE_KEY;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize Mux client with correct config', () => {
    expect(Mux).toHaveBeenCalledWith({
      tokenId: mockConfig.MUX_TOKEN_ID,
      tokenSecret: mockConfig.MUX_TOKEN_SECRET,
      jwtSigningKey: mockConfig.MUX_SIGNING_KEY_ID,
      jwtPrivateKey: mockConfig.MUX_SIGNING_KEY_SECRET,
      webhookSecret: mockConfig.MUX_WEBHOOK_SECRET,
    });
  });

  describe('createDirectUpload', () => {
    it('should create a direct upload and return URL and ID', async () => {
      mockMuxClient.video.uploads.create.mockResolvedValue({
        url: 'https://mux.example.com/upload',
        id: 'upload-123',
      });

      const result = await service.createDirectUpload();

      expect(result).toEqual({
        uploadUrl: 'https://mux.example.com/upload',
        uploadId: 'upload-123',
      });
      expect(mockMuxClient.video.uploads.create).toHaveBeenCalledWith({
        new_asset_settings: {
          playback_policies: ['signed'],
          video_quality: 'basic',
          meta: undefined,
          passthrough: undefined,
        },
        cors_origin: '*',
      });
    });

    it('should pass metadata to Mux when provided', async () => {
      mockMuxClient.video.uploads.create.mockResolvedValue({
        url: 'https://mux.example.com/upload',
        id: 'upload-123',
      });

      await service.createDirectUpload({
        meta: {
          externalId: 'ext-123',
          creatorId: 'creator-456',
          title: 'My Video',
        },
        passthrough: 'custom-data',
      });

      expect(mockMuxClient.video.uploads.create).toHaveBeenCalledWith({
        new_asset_settings: {
          playback_policies: ['signed'],
          video_quality: 'basic',
          meta: {
            external_id: 'ext-123',
            creator_id: 'creator-456',
            title: 'My Video',
          },
          passthrough: 'custom-data',
        },
        cors_origin: '*',
      });
    });

    it('should throw error if URL is not returned', async () => {
      mockMuxClient.video.uploads.create.mockResolvedValue({
        id: 'upload-123',
        // No URL
      });

      await expect(service.createDirectUpload()).rejects.toThrow(
        'Failed to create Mux direct upload',
      );
    });

    it('should throw error if ID is not returned', async () => {
      mockMuxClient.video.uploads.create.mockResolvedValue({
        url: 'https://mux.example.com/upload',
        // No ID
      });

      await expect(service.createDirectUpload()).rejects.toThrow(
        'Failed to create Mux direct upload',
      );
    });
  });

  describe('getUpload', () => {
    it('should retrieve upload status and asset ID', async () => {
      mockMuxClient.video.uploads.retrieve.mockResolvedValue({
        status: 'asset_created',
        asset_id: 'asset-456',
      });

      const result = await service.getUpload('upload-123');

      expect(result).toEqual({
        status: 'asset_created',
        assetId: 'asset-456',
      });
      expect(mockMuxClient.video.uploads.retrieve).toHaveBeenCalledWith(
        'upload-123',
      );
    });

    it('should handle upload without asset ID', async () => {
      mockMuxClient.video.uploads.retrieve.mockResolvedValue({
        status: 'waiting',
      });

      const result = await service.getUpload('upload-123');

      expect(result).toEqual({
        status: 'waiting',
        assetId: undefined,
      });
    });

    it('should handle unknown status', async () => {
      mockMuxClient.video.uploads.retrieve.mockResolvedValue({});

      const result = await service.getUpload('upload-123');

      expect(result.status).toBe('unknown');
    });
  });

  describe('getAsset', () => {
    it('should retrieve asset with playback ID', async () => {
      mockMuxClient.video.assets.retrieve.mockResolvedValue({
        id: 'asset-456',
        status: 'ready',
        playback_ids: [{ id: 'playback-789' }],
        duration: 120.5,
      });

      const result = await service.getAsset('asset-456');

      expect(result).toEqual({
        id: 'asset-456',
        status: 'ready',
        playbackId: 'playback-789',
        duration: 120.5,
      });
    });

    it('should handle asset without playback IDs', async () => {
      mockMuxClient.video.assets.retrieve.mockResolvedValue({
        id: 'asset-456',
        status: 'preparing',
      });

      const result = await service.getAsset('asset-456');

      expect(result).toEqual({
        id: 'asset-456',
        status: 'preparing',
        playbackId: undefined,
        duration: undefined,
      });
    });
  });

  describe('getSignedPlaybackUrl', () => {
    it('should generate a signed playback URL', async () => {
      mockMuxClient.jwt.signPlaybackId.mockResolvedValue('signed-token-123');

      const result = await service.getSignedPlaybackUrl('playback-789');

      expect(result).toBe(
        'https://stream.mux.com/playback-789.m3u8?token=signed-token-123',
      );
      expect(mockMuxClient.jwt.signPlaybackId).toHaveBeenCalledWith(
        'playback-789',
        {
          expiration: '7d',
          type: 'video',
        },
      );
    });

    it('should use custom expiration time', async () => {
      mockMuxClient.jwt.signPlaybackId.mockResolvedValue('signed-token');

      await service.getSignedPlaybackUrl('playback-789', '1h');

      expect(mockMuxClient.jwt.signPlaybackId).toHaveBeenCalledWith(
        'playback-789',
        {
          expiration: '1h',
          type: 'video',
        },
      );
    });
  });

  describe('getSignedPlayerTokens', () => {
    it('should generate all three player tokens', async () => {
      mockMuxClient.jwt.signPlaybackId
        .mockResolvedValueOnce('playback-token')
        .mockResolvedValueOnce('thumbnail-token')
        .mockResolvedValueOnce('storyboard-token');

      const result = await service.getSignedPlayerTokens('playback-789');

      expect(result).toEqual({
        playbackToken: 'playback-token',
        thumbnailToken: 'thumbnail-token',
        storyboardToken: 'storyboard-token',
      });
      expect(mockMuxClient.jwt.signPlaybackId).toHaveBeenCalledTimes(3);
    });

    it('should call signPlaybackId with correct types', async () => {
      mockMuxClient.jwt.signPlaybackId.mockResolvedValue('token');

      await service.getSignedPlayerTokens('playback-789');

      const calls = mockMuxClient.jwt.signPlaybackId.mock.calls;
      expect(calls[0][1].type).toBe('video');
      expect(calls[1][1].type).toBe('thumbnail');
      expect(calls[2][1].type).toBe('storyboard');
    });

    it('should use custom expiration for all tokens', async () => {
      mockMuxClient.jwt.signPlaybackId.mockResolvedValue('token');

      await service.getSignedPlayerTokens('playback-789', '24h');

      const calls = mockMuxClient.jwt.signPlaybackId.mock.calls;
      expect(calls[0][1].expiration).toBe('24h');
      expect(calls[1][1].expiration).toBe('24h');
      expect(calls[2][1].expiration).toBe('24h');
    });
  });

  describe('deleteAsset', () => {
    it('should delete an asset', async () => {
      mockMuxClient.video.assets.delete.mockResolvedValue({});

      await service.deleteAsset('asset-456');

      expect(mockMuxClient.video.assets.delete).toHaveBeenCalledWith(
        'asset-456',
      );
    });

    it('should propagate errors from Mux', async () => {
      const error = new Error('Mux deletion failed');
      mockMuxClient.video.assets.delete.mockRejectedValue(error);

      await expect(service.deleteAsset('asset-456')).rejects.toThrow(
        'Mux deletion failed',
      );
    });
  });

  describe('cancelUpload', () => {
    it('should cancel a pending upload', async () => {
      mockMuxClient.video.uploads.cancel.mockResolvedValue({});

      await service.cancelUpload('upload-123');

      expect(mockMuxClient.video.uploads.cancel).toHaveBeenCalledWith(
        'upload-123',
      );
    });
  });
});
