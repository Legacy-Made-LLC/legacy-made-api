import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiClsService } from 'src/lib/api-cls.service';
import { RevenuecatService } from 'src/revenuecat/revenuecat.service';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { EntitlementInfo } from './entitlements.types';

describe('EntitlementsController', () => {
  let controller: EntitlementsController;
  let entitlementsService: jest.Mocked<EntitlementsService>;
  let revenuecatService: jest.Mocked<RevenuecatService>;
  let cls: jest.Mocked<ApiClsService>;

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
    subscription: {
      status: null,
      currentPeriodEnd: null,
      cancellationPending: false,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 10_000, limit: 3 },
          { name: 'medium', ttl: 60_000, limit: 10 },
        ]),
      ],
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
        {
          provide: RevenuecatService,
          useValue: {
            reconcileFromRc: jest.fn().mockResolvedValue({
              tier: 'free',
              status: 'expired',
              currentPeriodEnd: null,
              cancellationPending: false,
            }),
          },
        },
        {
          provide: ApiClsService,
          useValue: {
            requireUserId: jest.fn().mockReturnValue('user_test'),
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<EntitlementsController>(EntitlementsController);
    entitlementsService = module.get(EntitlementsService);
    revenuecatService = module.get(RevenuecatService);
    cls = module.get(ApiClsService);
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

  describe('syncEntitlements', () => {
    it('reconciles against RC then returns refreshed entitlement info', async () => {
      const result = await controller.syncEntitlements();

      expect(cls.requireUserId).toHaveBeenCalled();
      expect(revenuecatService.reconcileFromRc).toHaveBeenCalledWith(
        'user_test',
      );
      expect(entitlementsService.getEntitlementInfo).toHaveBeenCalled();
      expect(result).toEqual(mockEntitlementInfo);
    });

    it('still returns entitlement info if reconcile rejects (caller decides handling)', async () => {
      revenuecatService.reconcileFromRc.mockRejectedValueOnce(
        new Error('RC down'),
      );

      await expect(controller.syncEntitlements()).rejects.toThrow('RC down');
      expect(entitlementsService.getEntitlementInfo).not.toHaveBeenCalled();
    });

    it('rejects with BadRequest when called in trusted-contact context', async () => {
      cls.get.mockImplementation((key) =>
        key === 'planOwnerId' ? 'plan_owner_xyz' : undefined,
      );

      await expect(controller.syncEntitlements()).rejects.toThrow(
        BadRequestException,
      );
      expect(revenuecatService.reconcileFromRc).not.toHaveBeenCalled();
      expect(entitlementsService.getEntitlementInfo).not.toHaveBeenCalled();
    });
  });
});
