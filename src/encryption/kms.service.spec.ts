import { Test, TestingModule } from '@nestjs/testing';
import { KmsService } from './kms.service';
import { ApiConfigService } from '../config/api-config.service';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  EncryptCommand: jest.fn(),
  DecryptCommand: jest.fn(),
}));

describe('KmsService', () => {
  let service: KmsService;

  const mockApiConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        AWS_KMS_REGION: 'us-east-1',
        AWS_KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789:key/test-key',
        AWS_ACCESS_KEY_ID_KMS: 'test-access-key',
        AWS_SECRET_ACCESS_KEY_KMS: 'test-secret-key',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KmsService,
        { provide: ApiConfigService, useValue: mockApiConfigService },
      ],
    }).compile();

    service = module.get<KmsService>(KmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
