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
    Pick<EntitlementsService, 'checkGuardEntitlements'>
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
      checkGuardEntitlements: jest.fn(),
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

  it('should allow access when no decorators are present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEntitlementsService.checkGuardEntitlements).toHaveBeenCalledWith(
      {
        pillar: undefined,
        viewPillar: undefined,
        quota: undefined,
      },
    );
  });

  it('should pass pillar metadata to checkGuardEntitlements', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_PILLAR) return 'important_info';
      return undefined;
    });

    const context = createMockExecutionContext();
    await guard.canActivate(context);

    expect(mockEntitlementsService.checkGuardEntitlements).toHaveBeenCalledWith(
      {
        pillar: 'important_info',
        viewPillar: undefined,
        quota: undefined,
      },
    );
  });

  it('should pass view pillar metadata to checkGuardEntitlements', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_VIEW_PILLAR) return 'messages';
      return undefined;
    });

    const context = createMockExecutionContext();
    await guard.canActivate(context);

    expect(mockEntitlementsService.checkGuardEntitlements).toHaveBeenCalledWith(
      {
        pillar: undefined,
        viewPillar: 'messages',
        quota: undefined,
      },
    );
  });

  it('should pass quota metadata to checkGuardEntitlements', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_QUOTA) return 'entries';
      return undefined;
    });

    const context = createMockExecutionContext();
    await guard.canActivate(context);

    expect(mockEntitlementsService.checkGuardEntitlements).toHaveBeenCalledWith(
      {
        pillar: undefined,
        viewPillar: undefined,
        quota: 'entries',
      },
    );
  });

  it('should pass combined metadata to checkGuardEntitlements', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_PILLAR) return 'important_info';
      if (key === REQUIRED_VIEW_PILLAR) return 'messages';
      if (key === REQUIRED_QUOTA) return 'entries';
      return undefined;
    });

    const context = createMockExecutionContext();
    await guard.canActivate(context);

    expect(mockEntitlementsService.checkGuardEntitlements).toHaveBeenCalledWith(
      {
        pillar: 'important_info',
        viewPillar: 'messages',
        quota: 'entries',
      },
    );
  });

  it('should propagate EntitlementException from service', async () => {
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

    mockEntitlementsService.checkGuardEntitlements.mockRejectedValue(
      new EntitlementException(deniedResult),
    );

    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_PILLAR) return 'messages';
      return undefined;
    });

    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      EntitlementException,
    );
  });

  it('should include correct details in propagated exception', async () => {
    const deniedResult: EntitlementResult = {
      allowed: false,
      reason: 'quota_exceeded',
      message: 'You have reached the maximum number of entries for your plan',
      details: {
        feature: 'entries',
        tier: 'free',
        limit: 5,
        current: 5,
        upgradeRequired: true,
        suggestedTier: 'individual',
      },
    };

    mockEntitlementsService.checkGuardEntitlements.mockRejectedValue(
      new EntitlementException(deniedResult),
    );

    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_QUOTA) return 'entries';
      return undefined;
    });

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
});
