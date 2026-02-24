import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { SharedPlansService } from './shared-plans.service';

describe('SharedPlansService', () => {
  let service: SharedPlansService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn(),
    requireUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedPlansService,
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

    service = module.get<SharedPlansService>(SharedPlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
