import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiClsService } from '../lib/api-cls.service';
import { PlanAccessGuard, REQUIRED_ACCESS_LEVEL } from './plan-access.guard';
import { PlanAccessService } from './plan-access.service';

describe('PlanAccessGuard', () => {
  let guard: PlanAccessGuard;
  let mockPlanAccessService: jest.Mocked<
    Pick<PlanAccessService, 'getPlanAccess'>
  >;
  let mockReflector: jest.Mocked<Reflector>;
  let mockClsService: { get: jest.Mock; set: jest.Mock };

  const createMockExecutionContext = (planId?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params: planId ? { planId } : {},
          query: {},
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    mockPlanAccessService = {
      getPlanAccess: jest.fn(),
    };

    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockClsService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanAccessGuard,
        {
          provide: PlanAccessService,
          useValue: mockPlanAccessService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: ApiClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    guard = module.get<PlanAccessGuard>(PlanAccessGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should pass through when no planId in route', async () => {
    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access for plan owners', async () => {
    mockPlanAccessService.getPlanAccess.mockResolvedValue({
      role: 'owner',
      ownerId: 'owner-user-id',
    });

    const context = createMockExecutionContext('some-plan-id');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockClsService.set).toHaveBeenCalledWith('planAccessRole', 'owner');
    // planOwnerId should NOT be set for owners — they use normal RLS
    expect(mockClsService.set).not.toHaveBeenCalledWith(
      'planOwnerId',
      expect.anything(),
    );
  });

  it('should allow read access for trusted contacts', async () => {
    mockPlanAccessService.getPlanAccess.mockResolvedValue({
      role: 'trusted_contact',
      accessLevel: 'full_view',
      ownerId: 'owner-user-id',
    });
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockExecutionContext('some-plan-id');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockClsService.set).toHaveBeenCalledWith(
      'planAccessRole',
      'trusted_contact',
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'planAccessLevel',
      'full_view',
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'planOwnerId',
      'owner-user-id',
    );
  });

  it('should block trusted contacts without full_edit on write endpoints', async () => {
    mockPlanAccessService.getPlanAccess.mockResolvedValue({
      role: 'trusted_contact',
      accessLevel: 'full_view',
      ownerId: 'owner-user-id',
    });
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_ACCESS_LEVEL) return 'full_edit';
      return undefined;
    });

    const context = createMockExecutionContext('some-plan-id');
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow full_edit trusted contacts on write endpoints', async () => {
    mockPlanAccessService.getPlanAccess.mockResolvedValue({
      role: 'trusted_contact',
      accessLevel: 'full_edit',
      ownerId: 'owner-user-id',
    });
    mockReflector.getAllAndOverride.mockImplementation((key) => {
      if (key === REQUIRED_ACCESS_LEVEL) return 'full_edit';
      return undefined;
    });

    const context = createMockExecutionContext('some-plan-id');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user has no access', async () => {
    mockPlanAccessService.getPlanAccess.mockResolvedValue(null);

    const context = createMockExecutionContext('some-plan-id');
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
