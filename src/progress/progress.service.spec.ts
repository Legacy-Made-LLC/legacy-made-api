import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService } from './progress.service';
import { DbService } from '../db/db.service';

describe('ProgressService', () => {
  let service: ProgressService;

  const mockDbService = {
    drizzle: {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'test-id' }]),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockReturnThis(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
