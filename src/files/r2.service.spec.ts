import { Test, TestingModule } from '@nestjs/testing';
import { R2Service } from './r2.service';
import { ApiConfigService } from '../config/api-config.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('R2Service', () => {
  let service: R2Service;
  let mockS3Client: jest.Mocked<S3Client>;

  const mockConfig = {
    R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
  };

  const mockApiConfigService = {
    get: jest.fn((key: string) => mockConfig[key as keyof typeof mockConfig]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock S3Client constructor
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: jest.fn(),
    }));

    // Mock getSignedUrl
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://r2.example.com/signed-url',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2Service,
        {
          provide: ApiConfigService,
          useValue: mockApiConfigService,
        },
      ],
    }).compile();

    service = module.get<R2Service>(R2Service);
    mockS3Client = (service as any).client;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize S3Client with correct config', () => {
    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: mockConfig.R2_ENDPOINT,
      credentials: {
        accessKeyId: mockConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: mockConfig.R2_SECRET_ACCESS_KEY,
      },
    });
  });

  describe('createPresignedUploadUrl', () => {
    it('should generate a presigned upload URL', async () => {
      const key = 'test-key.pdf';
      const contentType = 'application/pdf';

      const result = await service.createPresignedUploadUrl(key, contentType);

      expect(result).toBe('https://r2.example.com/signed-url');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(PutObjectCommand),
        { expiresIn: 3600 },
      );
    });

    it('should use custom expiration time', async () => {
      const key = 'test-key.pdf';
      const contentType = 'application/pdf';
      const customExpiry = 7200;

      await service.createPresignedUploadUrl(key, contentType, customExpiry);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(PutObjectCommand),
        { expiresIn: customExpiry },
      );
    });
  });

  describe('createPresignedDownloadUrl', () => {
    it('should generate a presigned download URL', async () => {
      const key = 'test-key.pdf';

      const result = await service.createPresignedDownloadUrl(key);

      expect(result).toBe('https://r2.example.com/signed-url');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
    });

    it('should use custom expiration time', async () => {
      const key = 'test-key.pdf';
      const customExpiry = 1800;

      await service.createPresignedDownloadUrl(key, customExpiry);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: customExpiry },
      );
    });
  });

  describe('createMultipartUpload', () => {
    it('should initiate a multipart upload and return uploadId', async () => {
      const key = 'large-file.zip';
      const contentType = 'application/zip';
      const uploadId = 'test-upload-id';

      mockS3Client.send = jest.fn().mockResolvedValue({ UploadId: uploadId });

      const result = await service.createMultipartUpload(key, contentType);

      expect(result).toBe(uploadId);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(CreateMultipartUploadCommand),
      );
    });

    it('should throw error if UploadId is not returned', async () => {
      const key = 'large-file.zip';
      const contentType = 'application/zip';

      mockS3Client.send = jest.fn().mockResolvedValue({});

      await expect(
        service.createMultipartUpload(key, contentType),
      ).rejects.toThrow('Failed to initiate multipart upload');
    });
  });

  describe('getPartUploadUrls', () => {
    it('should generate presigned URLs for all parts', async () => {
      const key = 'large-file.zip';
      const uploadId = 'test-upload-id';
      const numParts = 3;

      (getSignedUrl as jest.Mock)
        .mockResolvedValueOnce('https://r2.example.com/part1')
        .mockResolvedValueOnce('https://r2.example.com/part2')
        .mockResolvedValueOnce('https://r2.example.com/part3');

      const result = await service.getPartUploadUrls(key, uploadId, numParts);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        partNumber: 1,
        uploadUrl: 'https://r2.example.com/part1',
      });
      expect(result[1]).toEqual({
        partNumber: 2,
        uploadUrl: 'https://r2.example.com/part2',
      });
      expect(result[2]).toEqual({
        partNumber: 3,
        uploadUrl: 'https://r2.example.com/part3',
      });
      expect(getSignedUrl).toHaveBeenCalledTimes(3);
    });

    it('should use UploadPartCommand for each part', async () => {
      const key = 'large-file.zip';
      const uploadId = 'test-upload-id';
      const numParts = 2;

      await service.getPartUploadUrls(key, uploadId, numParts);

      // Verify UploadPartCommand was used
      const calls = (getSignedUrl as jest.Mock).mock.calls;
      expect(calls[0][1]).toBeInstanceOf(UploadPartCommand);
      expect(calls[1][1]).toBeInstanceOf(UploadPartCommand);
    });
  });

  describe('completeMultipartUpload', () => {
    it('should complete multipart upload with provided parts', async () => {
      const key = 'large-file.zip';
      const uploadId = 'test-upload-id';
      const parts = [
        { partNumber: 1, etag: 'etag1' },
        { partNumber: 2, etag: 'etag2' },
      ];

      mockS3Client.send = jest.fn().mockResolvedValue({});

      await service.completeMultipartUpload(key, uploadId, parts);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(CompleteMultipartUploadCommand),
      );
    });
  });

  describe('abortMultipartUpload', () => {
    it('should abort a multipart upload', async () => {
      const key = 'large-file.zip';
      const uploadId = 'test-upload-id';

      mockS3Client.send = jest.fn().mockResolvedValue({});

      await service.abortMultipartUpload(key, uploadId);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(AbortMultipartUploadCommand),
      );
    });
  });

  describe('deleteObject', () => {
    it('should delete an object from R2', async () => {
      const key = 'test-key.pdf';

      mockS3Client.send = jest.fn().mockResolvedValue({});

      await service.deleteObject(key);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );
    });

    it('should propagate errors from S3', async () => {
      const key = 'test-key.pdf';
      const error = new Error('S3 deletion failed');

      mockS3Client.send = jest.fn().mockRejectedValue(error);

      await expect(service.deleteObject(key)).rejects.toThrow(
        'S3 deletion failed',
      );
    });
  });
});
