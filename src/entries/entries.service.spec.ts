import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EntriesService } from './entries.service';
import { DbService } from '../db/db.service';
import { EntitlementsService } from '../entitlements';
import { FilesService } from '../files/files.service';

describe('EntriesService', () => {
  let service: EntriesService;

  const mockDbService = {
    drizzle: {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'test-id' }]),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    },
  };

  const mockEntitlementsService = {
    getQuotaStatusInTx: jest.fn().mockResolvedValue({
      limit: 5,
      current: 0,
      remaining: 5,
      unlimited: false,
    }),
  };

  const mockFilesService = {
    findByEntryIds: jest.fn().mockResolvedValue([]),
    findAllForEntry: jest.fn().mockResolvedValue([]),
    toFileResponses: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntriesService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ActivityLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EntriesService>(EntriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
