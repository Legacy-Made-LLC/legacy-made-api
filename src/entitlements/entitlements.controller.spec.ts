import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { EntitlementInfo } from './entitlements.types';

describe('EntitlementsController', () => {
  let controller: EntitlementsController;
  let entitlementsService: jest.Mocked<EntitlementsService>;

  const mockEntitlementInfo: EntitlementInfo = {
    tier: 'free',
    tierName: 'Free',
    tierDescription: 'Get Oriented',
    pillars: ['important_info'],
    viewOnlyPillars: ['wishes', 'messages', 'family_access'],
    quotas: [
      {
        feature: 'entries',
        displayName: 'important information items',
        limit: 5,
        current: 3,
        unlimited: false,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntitlementsController],
      providers: [
        {
          provide: EntitlementsService,
          useValue: {
            getEntitlementInfo: jest
              .fn()
              .mockResolvedValue(mockEntitlementInfo),
          },
        },
      ],
    }).compile();

    controller = module.get<EntitlementsController>(EntitlementsController);
    entitlementsService = module.get(EntitlementsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getEntitlements', () => {
    it('should return entitlement info', async () => {
      const result = await controller.getEntitlements();

      expect(result).toEqual(mockEntitlementInfo);
      expect(entitlementsService.getEntitlementInfo).toHaveBeenCalled();
    });
  });
});
