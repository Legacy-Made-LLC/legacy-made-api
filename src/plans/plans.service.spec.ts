import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;

  const mockDbService = {
    drizzle: {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'test-plan-id' }]),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    },
  };

  const mockClsService = {
    get: jest.fn().mockReturnValue('test-user-id'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: ApiClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
