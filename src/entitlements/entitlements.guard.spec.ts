import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementException } from './entitlements.exception';
import {
  EntitlementsGuard,
  REQUIRED_PILLAR,
  REQUIRED_QUOTA,
  REQUIRED_VIEW_PILLAR,
} from './entitlements.guard';
import { EntitlementsService } from './entitlements.service';
import { EntitlementResult } from './entitlements.types';

describe('EntitlementsGuard', () => {
  let guard: EntitlementsGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockEntitlementsService: jest.Mocked<
    Pick<
      EntitlementsService,
      'canAccessPillar' | 'canViewPillar' | 'canUseQuota'
    >
  >;

  const createMockExecutionContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockEntitlementsService = {
      canAccessPillar: jest.fn(),
      canViewPillar: jest.fn(),
      canUseQuota: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
      ],
    }).compile();

    guard = module.get<EntitlementsGuard>(EntitlementsGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when no entitlements are required', () => {
    it('should allow access when no decorators are present', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEntitlementsService.canAccessPillar).not.toHaveBeenCalled();
      expect(mockEntitlementsService.canViewPillar).not.toHaveBeenCalled();
      expect(mockEntitlementsService.canUseQuota).not.toHaveBeenCalled();
    });
  });

  describe('pillar access (edit/create)', () => {
    it('should allow access when user has pillar entitlement', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'important_info';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEntitlementsService.canAccessPillar).toHaveBeenCalledWith(
        'important_info',
      );
    });

    it('should block access when user lacks pillar entitlement', async () => {
      const deniedResult: EntitlementResult = {
        allowed: false,
        reason: 'feature_locked',
        message: 'Legacy Messages is not available on the Free plan',
        details: {
          feature: 'messages',
          tier: 'free',
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'messages';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue(deniedResult);

      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        EntitlementException,
      );
      expect(mockEntitlementsService.canAccessPillar).toHaveBeenCalledWith(
        'messages',
      );
    });

    it('should include upgrade suggestion in exception when blocked', async () => {
      const deniedResult: EntitlementResult = {
        allowed: false,
        reason: 'feature_locked',
        message: 'Wishes & Guidance is not available on the Free plan',
        details: {
          feature: 'wishes',
          tier: 'free',
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'wishes';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue(deniedResult);

      const context = createMockExecutionContext();

      try {
        await guard.canActivate(context);
        fail('Expected EntitlementException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EntitlementException);
        const entitlementError = error as EntitlementException;
        expect(entitlementError.getResponse()).toMatchObject({
          code: 'FEATURE_LOCKED',
          details: {
            suggestedTier: 'individual',
          },
        });
      }
    });
  });

  describe('pillar view access (read-only)', () => {
    it('should allow view access when user has view entitlement', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_VIEW_PILLAR) return 'messages';
        return undefined;
      });

      mockEntitlementsService.canViewPillar.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEntitlementsService.canViewPillar).toHaveBeenCalledWith(
        'messages',
      );
    });

    it('should allow view access for view-only pillars (free tier viewing messages)', async () => {
      // Free tier has messages in viewOnlyPillars
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_VIEW_PILLAR) return 'messages';
        return undefined;
      });

      mockEntitlementsService.canViewPillar.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should block view access when user lacks view entitlement', async () => {
      const deniedResult: EntitlementResult = {
        allowed: false,
        reason: 'feature_locked',
        message: 'This feature is not available on the Free plan',
        details: {
          feature: 'family_access',
          tier: 'free',
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_VIEW_PILLAR) return 'family_access';
        return undefined;
      });

      mockEntitlementsService.canViewPillar.mockResolvedValue(deniedResult);

      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        EntitlementException,
      );
    });
  });

  describe('quota checks', () => {
    it('should allow access when user is within quota', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      mockEntitlementsService.canUseQuota.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEntitlementsService.canUseQuota).toHaveBeenCalledWith(
        'entries',
      );
    });

    it('should block access when user exceeds quota', async () => {
      const deniedResult: EntitlementResult = {
        allowed: false,
        reason: 'quota_exceeded',
        message:
          'You have reached the maximum number of important information items for your plan',
        details: {
          feature: 'entries',
          tier: 'free',
          limit: 5,
          current: 5,
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      mockEntitlementsService.canUseQuota.mockResolvedValue(deniedResult);

      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        EntitlementException,
      );
      expect(mockEntitlementsService.canUseQuota).toHaveBeenCalledWith(
        'entries',
      );
    });

    it('should include quota details in exception when exceeded', async () => {
      const deniedResult: EntitlementResult = {
        allowed: false,
        reason: 'quota_exceeded',
        message:
          'You have reached the maximum number of important information items for your plan',
        details: {
          feature: 'entries',
          tier: 'free',
          limit: 5,
          current: 5,
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      mockEntitlementsService.canUseQuota.mockResolvedValue(deniedResult);

      const context = createMockExecutionContext();

      try {
        await guard.canActivate(context);
        fail('Expected EntitlementException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EntitlementException);
        const entitlementError = error as EntitlementException;
        const response = entitlementError.getResponse() as {
          code: string;
          details: { limit: number; current: number };
        };
        expect(response.code).toBe('QUOTA_EXCEEDED');
        expect(response.details?.limit).toBe(5);
        expect(response.details?.current).toBe(5);
      }
    });

    it('should allow unlimited usage for individual tier', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      // Individual tier has unlimited entries (-1)
      mockEntitlementsService.canUseQuota.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('combined pillar and quota checks', () => {
    it('should allow access when user has pillar access AND is within quota', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'important_info';
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue({
        allowed: true,
      });
      mockEntitlementsService.canUseQuota.mockResolvedValue({
        allowed: true,
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEntitlementsService.canAccessPillar).toHaveBeenCalledWith(
        'important_info',
      );
      expect(mockEntitlementsService.canUseQuota).toHaveBeenCalledWith(
        'entries',
      );
    });

    it('should block when user has pillar access but exceeds quota', async () => {
      const quotaExceeded: EntitlementResult = {
        allowed: false,
        reason: 'quota_exceeded',
        message: 'Quota exceeded',
        details: {
          feature: 'entries',
          tier: 'free',
          limit: 5,
          current: 5,
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'important_info';
        if (key === REQUIRED_QUOTA) return 'entries';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue({
        allowed: true,
      });
      mockEntitlementsService.canUseQuota.mockResolvedValue(quotaExceeded);

      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        EntitlementException,
      );
      // Pillar check should pass first
      expect(mockEntitlementsService.canAccessPillar).toHaveBeenCalled();
      // Then quota check should fail
      expect(mockEntitlementsService.canUseQuota).toHaveBeenCalled();
    });

    it('should block immediately when user lacks pillar access (before quota check)', async () => {
      const pillarDenied: EntitlementResult = {
        allowed: false,
        reason: 'feature_locked',
        message: 'Feature locked',
        details: {
          feature: 'messages',
          tier: 'free',
          upgradeRequired: true,
          suggestedTier: 'individual',
        },
      };

      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === REQUIRED_PILLAR) return 'messages';
        if (key === REQUIRED_QUOTA) return 'legacy_messages';
        return undefined;
      });

      mockEntitlementsService.canAccessPillar.mockResolvedValue(pillarDenied);

      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        EntitlementException,
      );
      // Pillar check should fail first
      expect(mockEntitlementsService.canAccessPillar).toHaveBeenCalled();
      // Quota check should NOT be called since pillar failed
      expect(mockEntitlementsService.canUseQuota).not.toHaveBeenCalled();
    });
  });

  describe('tier-specific scenarios', () => {
    describe('free tier user', () => {
      it('should allow creating entries within quota (under 5)', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_PILLAR) return 'important_info';
          if (key === REQUIRED_QUOTA) return 'entries';
          return undefined;
        });

        mockEntitlementsService.canAccessPillar.mockResolvedValue({
          allowed: true,
        });
        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should block creating entries when at quota (5 entries)', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_PILLAR) return 'important_info';
          if (key === REQUIRED_QUOTA) return 'entries';
          return undefined;
        });

        mockEntitlementsService.canAccessPillar.mockResolvedValue({
          allowed: true,
        });
        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: false,
          reason: 'quota_exceeded',
          message: 'You have reached the maximum of 5 entries',
          details: {
            feature: 'entries',
            tier: 'free',
            limit: 5,
            current: 5,
            upgradeRequired: true,
            suggestedTier: 'individual',
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });

      it('should block editing messages (view-only for free tier)', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_PILLAR) return 'messages';
          return undefined;
        });

        mockEntitlementsService.canAccessPillar.mockResolvedValue({
          allowed: false,
          reason: 'feature_locked',
          message: 'Legacy Messages is not available on the Free plan',
          details: {
            feature: 'messages',
            tier: 'free',
            upgradeRequired: true,
            suggestedTier: 'individual',
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });

      it('should allow viewing messages (view-only access)', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_VIEW_PILLAR) return 'messages';
          return undefined;
        });

        mockEntitlementsService.canViewPillar.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should block adding trusted contacts (quota is 0)', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'trusted_contacts';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: false,
          reason: 'quota_exceeded',
          message: 'Trusted contacts are not available on the Free plan',
          details: {
            feature: 'trusted_contacts',
            tier: 'free',
            limit: 0,
            current: 0,
            upgradeRequired: true,
            suggestedTier: 'individual',
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });
    });

    describe('individual tier user', () => {
      it('should allow unlimited entry creation', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_PILLAR) return 'important_info';
          if (key === REQUIRED_QUOTA) return 'entries';
          return undefined;
        });

        mockEntitlementsService.canAccessPillar.mockResolvedValue({
          allowed: true,
        });
        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: true, // unlimited = -1, always allowed
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should allow editing messages', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_PILLAR) return 'messages';
          return undefined;
        });

        mockEntitlementsService.canAccessPillar.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should allow adding 1 trusted contact', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'trusted_contacts';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should block adding a second trusted contact', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'trusted_contacts';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: false,
          reason: 'quota_exceeded',
          message: 'Individual plan allows only 1 trusted contact',
          details: {
            feature: 'trusted_contacts',
            tier: 'individual',
            limit: 1,
            current: 1,
            upgradeRequired: true,
            suggestedTier: 'family',
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });

      it('should block adding family profiles', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'family_profiles';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: false,
          reason: 'quota_exceeded',
          message: 'Family profiles are not available on the Individual plan',
          details: {
            feature: 'family_profiles',
            tier: 'individual',
            limit: 0,
            current: 0,
            upgradeRequired: true,
            suggestedTier: 'family',
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });
    });

    describe('family tier user', () => {
      it('should allow unlimited trusted contacts', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'trusted_contacts';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should allow up to 4 family profiles', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'family_profiles';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: true,
        });

        const context = createMockExecutionContext();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should block adding a 5th family profile', async () => {
        mockReflector.getAllAndOverride.mockImplementation((key) => {
          if (key === REQUIRED_QUOTA) return 'family_profiles';
          return undefined;
        });

        mockEntitlementsService.canUseQuota.mockResolvedValue({
          allowed: false,
          reason: 'quota_exceeded',
          message: 'Family plan allows up to 4 additional family profiles',
          details: {
            feature: 'family_profiles',
            tier: 'family',
            limit: 4,
            current: 4,
            upgradeRequired: false,
          },
        });

        const context = createMockExecutionContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
          EntitlementException,
        );
      });
    });
  });
});
