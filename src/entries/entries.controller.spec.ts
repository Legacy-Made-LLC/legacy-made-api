import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsGuard, EntitlementsService } from '../entitlements';
import { PlanAccessGuard } from '../plan-access/plan-access.guard';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';

describe('EntriesController', () => {
  let controller: EntriesController;

  const mockEntriesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByCategory: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockEntitlementsService = {
    canAccessPillar: jest.fn().mockResolvedValue({ allowed: true }),
    canViewPillar: jest.fn().mockResolvedValue({ allowed: true }),
    canUseQuota: jest.fn().mockResolvedValue({ allowed: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntriesController],
      providers: [
        {
          provide: EntriesService,
          useValue: mockEntriesService,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
      ],
    })
      .overrideGuard(PlanAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(EntitlementsGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<EntriesController>(EntriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
