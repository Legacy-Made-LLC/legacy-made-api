import { Test, TestingModule } from '@nestjs/testing';
import type { Config } from 'src/config';
import { ApiConfigService } from '../config/api-config.service';
import { DbService } from './db.service';

const mockConfig: Partial<Config> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
};

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DbService,
        {
          provide: ApiConfigService,
          useValue: {
            get: (key: keyof Config) => {
              return mockConfig[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
