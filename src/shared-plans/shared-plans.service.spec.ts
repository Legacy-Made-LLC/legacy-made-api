import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { SharedPlansService } from './shared-plans.service';

describe('SharedPlansService', () => {
  let service: SharedPlansService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn(),
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
          provide: ClsService,
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
