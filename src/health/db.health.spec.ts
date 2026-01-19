import { Test, TestingModule } from '@nestjs/testing';
import { DbHealthIndicator } from './db.health';

describe('DbHealthIndicator', () => {
  let provider: DbHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbHealthIndicator],
    }).compile();

    provider = module.get<DbHealthIndicator>(DbHealthIndicator);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
