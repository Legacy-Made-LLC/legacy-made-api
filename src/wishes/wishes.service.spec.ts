import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApiClsService } from '../lib/api-cls.service';
import { WishesService } from './wishes.service';
import { DbService } from '../db/db.service';
import { EntitlementsService } from '../entitlements';
import { FilesService } from '../files/files.service';

describe('WishesService', () => {
  let service: WishesService;

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
      limit: -1,
      current: 0,
      remaining: null,
      unlimited: true,
    }),
  };

  const mockFilesService = {
    findByWishIds: jest.fn().mockResolvedValue([]),
    findAllForWish: jest.fn().mockResolvedValue([]),
    toFileResponses: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WishesService,
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
          provide: ApiClsService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ActivityLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WishesService>(WishesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
