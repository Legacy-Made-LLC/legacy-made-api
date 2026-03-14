import { Test, TestingModule } from '@nestjs/testing';
import { DeviceLinkingService } from './device-linking.service';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';

describe('DeviceLinkingService', () => {
  let service: DeviceLinkingService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    requireUserId: jest.fn().mockReturnValue('user-123'),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceLinkingService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<DeviceLinkingService>(DeviceLinkingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
