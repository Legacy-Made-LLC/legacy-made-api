import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { EmailService } from '../email/email.service';
import { KmsService } from './kms.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    requireUserId: jest.fn().mockReturnValue('user-123'),
    get: jest.fn(),
  };

  const mockKmsService = {
    encryptDek: jest.fn(),
    decryptDek: jest.fn(),
  };

  const mockEmailService = {
    sendRecoveryNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
        { provide: KmsService, useValue: mockKmsService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
