import { Test, TestingModule } from '@nestjs/testing';
import { KmsService } from './kms.service';
import { ApiConfigService } from '../config/api-config.service';
import { CacheService } from '../cache/cache.service';

const mockSend = jest.fn();

// Mock the AWS SDK
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  DecryptCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'DecryptCommand',
  })),
  GetPublicKeyCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'GetPublicKeyCommand',
  })),
}));

describe('KmsService', () => {
  let service: KmsService;

  const mockApiConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        AWS_KMS_REGION: 'us-east-1',
        AWS_KMS_ASYMMETRIC_KEY_ARN:
          'arn:aws:kms:us-east-1:123456789:key/asymmetric-key',
        AWS_ACCESS_KEY_ID_KMS: 'test-access-key',
        AWS_SECRET_ACCESS_KEY_KMS: 'test-secret-key',
      };
      return config[key];
    }),
  };

  // Real-ish in-memory cache for testing
  const cacheStore = new Map<string, unknown>();
  const mockCacheService = {
    get: jest.fn(async (key: string) => cacheStore.get(key)),
    set: jest.fn(async (key: string, value: unknown) =>
      cacheStore.set(key, value),
    ),
    del: jest.fn(async (key: string) => cacheStore.delete(key)),
    getOrSet: jest.fn(
      async <T>(key: string, factory: () => Promise<T>): Promise<T> => {
        const cached = cacheStore.get(key);
        if (cached !== undefined) return cached as T;
        const value = await factory();
        cacheStore.set(key, value);
        return value;
      },
    ),
  };

  beforeEach(async () => {
    cacheStore.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KmsService,
        { provide: ApiConfigService, useValue: mockApiConfigService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<KmsService>(KmsService);
    mockSend.mockReset();
    mockCacheService.getOrSet.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // getPublicKey
  // =========================================================================

  describe('getPublicKey', () => {
    const mockDerBytes = Buffer.from('mock-public-key-der');

    it('should fetch and return base64-encoded public key', async () => {
      mockSend.mockResolvedValue({ PublicKey: mockDerBytes });

      const result = await service.getPublicKey();

      expect(result).toBe(mockDerBytes.toString('base64'));
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return cached key on subsequent calls', async () => {
      mockSend.mockResolvedValue({ PublicKey: mockDerBytes });

      const first = await service.getPublicKey();
      const second = await service.getPublicKey();

      expect(first).toBe(second);
      // Only one KMS call — second call hits cache
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should use CacheService.getOrSet for request coalescing', async () => {
      mockSend.mockResolvedValue({ PublicKey: mockDerBytes });

      await service.getPublicKey();

      expect(mockCacheService.getOrSet).toHaveBeenCalledWith(
        'kms:escrow-public-key',
        expect.any(Function),
        24 * 60 * 60 * 1000,
      );
    });

    it('should throw if KMS returns no key material', async () => {
      mockSend.mockResolvedValue({ PublicKey: undefined });

      await expect(service.getPublicKey()).rejects.toThrow(
        'KMS GetPublicKey returned no key material',
      );
    });
  });

  // =========================================================================
  // decryptDek
  // =========================================================================

  describe('decryptDek', () => {
    it('should decrypt using asymmetric key with RSAES_OAEP_SHA_256', async () => {
      const ciphertext = Buffer.from('encrypted-data');
      const plaintext = Buffer.from('decrypted-dek');

      mockSend.mockResolvedValue({ Plaintext: plaintext });

      const result = await service.decryptDek(ciphertext);

      expect(result).toEqual(plaintext);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verify the DecryptCommand was constructed with correct params
      const { DecryptCommand } = jest.requireMock('@aws-sdk/client-kms');
      expect(DecryptCommand).toHaveBeenCalledWith({
        KeyId: 'arn:aws:kms:us-east-1:123456789:key/asymmetric-key',
        CiphertextBlob: ciphertext,
        EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
      });
    });

    it('should throw if KMS returns no plaintext', async () => {
      mockSend.mockResolvedValue({ Plaintext: undefined });

      await expect(
        service.decryptDek(Buffer.from('ciphertext')),
      ).rejects.toThrow('KMS decryption returned no plaintext');
    });
  });
});
