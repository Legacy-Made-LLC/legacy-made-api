import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { EncryptionController } from './encryption.controller';
import { EncryptionService } from './encryption.service';
import { DeviceLinkingService } from './device-linking.service';
import { ApiClsService } from '../lib/api-cls.service';

describe('EncryptionController', () => {
  let controller: EncryptionController;

  const mockEncryptionService = {
    registerPublicKey: jest.fn(),
    rotatePublicKey: jest.fn(),
    getMyPublicKey: jest.fn(),
    getUserPublicKey: jest.fn(),
    storeEncryptedDek: jest.fn(),
    getMyEncryptedDek: jest.fn(),
    getEncryptedDeksForOwner: jest.fn(),
    deleteContactDek: jest.fn(),
    getDekStatus: jest.fn(),
    enableEscrow: jest.fn(),
    initiateRecovery: jest.fn(),
    getRecoveryEvents: jest.fn(),
    enableE2ee: jest.fn(),
    getE2eeStatus: jest.fn(),
  };

  const mockDeviceLinkingService = {
    createSession: jest.fn(),
    depositPayload: jest.fn(),
    claimSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 60000, limit: 20 },
        ]),
      ],
      controllers: [EncryptionController],
      providers: [
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: DeviceLinkingService, useValue: mockDeviceLinkingService },
        { provide: ApiClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<EncryptionController>(EncryptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
