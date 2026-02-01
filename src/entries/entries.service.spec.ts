import { Test, TestingModule } from '@nestjs/testing';
import { EntriesService } from './entries.service';
import { DbService } from '../db/db.service';
import { EntitlementsService } from '../entitlements';

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
      ],
    }).compile();

    service = module.get<EntriesService>(EntriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
