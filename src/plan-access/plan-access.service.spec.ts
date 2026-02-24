import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DbService } from '../db/db.service';
import { PlanAccessService } from './plan-access.service';

describe('PlanAccessService', () => {
  let service: PlanAccessService;

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
        PlanAccessService,
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

    service = module.get<PlanAccessService>(PlanAccessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
