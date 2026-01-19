import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { DbHealthIndicator } from './db.health';
import { DbService } from 'src/db/db.service';

describe('DbHealthIndicator', () => {
  let provider: DbHealthIndicator;

  const mockHealthIndicatorService = {
    check: jest.fn(),
  };

  const mockDbService = {
    drizzle: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DbHealthIndicator,
        {
          provide: HealthIndicatorService,
          useValue: mockHealthIndicatorService,
        },
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    provider = module.get<DbHealthIndicator>(DbHealthIndicator);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
