import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PlanAccessGuard } from '../plan-access/plan-access.guard';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

describe('PlansController', () => {
  let controller: PlansController;

  const mockPlansService = {
    getOrCreate: jest.fn(),
  };

  const mockEntitlementsService = {
    getEntitlementInfo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [
        {
          provide: PlansService,
          useValue: mockPlansService,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
      ],
    })
      .overrideGuard(PlanAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<PlansController>(PlansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPlanEntitlements', () => {
    it('should delegate to entitlementsService.getEntitlementInfo', async () => {
      const mockInfo = {
        tier: 'individual',
        tierName: 'Individual',
        tierDescription: 'Full individual coverage',
        pillars: ['important_info', 'wishes', 'messages', 'family_access'],
        viewOnlyPillars: [],
        quotas: [],
      };
      mockEntitlementsService.getEntitlementInfo.mockResolvedValue(mockInfo);

      const result = await controller.getPlanEntitlements();

      expect(result).toBe(mockInfo);
      expect(mockEntitlementsService.getEntitlementInfo).toHaveBeenCalled();
    });
  });
});
