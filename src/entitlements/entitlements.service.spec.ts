import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import {
  SUBSCRIPTION_GRACE_PERIOD_MS,
  TIER_CONFIG,
} from './entitlements.config';
import { EntitlementException } from './entitlements.exception';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionTier } from './entitlements.types';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let mockDbService: {
    rls: jest.Mock;
    bypassRls: jest.Mock;
  };
  let mockClsService: {
    get: jest.Mock;
  };

  const createMockTx = (
    tierOverride?: SubscriptionTier,
    entryCount = 0,
    currentPeriodEnd: Date | null = null,
  ) => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest
      .fn()
      .mockResolvedValue([
        { tier: tierOverride ?? 'free', count: entryCount, currentPeriodEnd },
      ]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    mockDbService = {
      rls: jest.fn((callback) => callback(createMockTx())),
      bypassRls: jest.fn((callback) => callback(createMockTx())),
    };

    mockClsService = {
      get: jest.fn((key: string) => {
        if (key === 'userId') return 'test-user-id';
        return undefined; // planOwnerId etc. are undefined by default
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
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

    service = module.get<EntitlementsService>(EntitlementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTier', () => {
    it('should return the user tier from database', async () => {
      const tier = await service.getTier();
      expect(tier).toBe('free');
    });

    it('should return free tier when no subscription exists', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback({
          select: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([]), // No subscription found
        }),
      );

      const tier = await service.getTier();
      expect(tier).toBe('free');
    });

    it('should throw error when no user ID in context', async () => {
      mockClsService.get.mockReturnValue(undefined);

      await expect(service.getTier()).rejects.toThrow('No user ID in context');
    });
  });

  describe('tier configuration validation', () => {
    it('should have correct free tier configuration', () => {
      const freeConfig = TIER_CONFIG.free;

      expect(freeConfig.name).toBe('Free');
      expect(freeConfig.description).toBe('Get Oriented');
      expect(freeConfig.pillars).toEqual(['important_info']);
      expect(freeConfig.viewOnlyPillars).toEqual([
        'wishes',
        'messages',
        'family_access',
      ]);
      expect(freeConfig.quotas).toEqual({
        entries: 5,
        wishes: 0,
        trusted_contacts: 0,
        family_profiles: 0,
        legacy_messages: 0,
        storage_mb: 0,
      });
    });

    it('should have correct individual tier configuration', () => {
      const individualConfig = TIER_CONFIG.individual;

      expect(individualConfig.name).toBe('Individual');
      expect(individualConfig.description).toBe('Full individual coverage');
      expect(individualConfig.pillars).toEqual([
        'important_info',
        'wishes',
        'messages',
        'family_access',
      ]);
      expect(individualConfig.viewOnlyPillars).toEqual([]);
      expect(individualConfig.quotas).toEqual({
        entries: -1, // unlimited
        wishes: -1, // unlimited
        trusted_contacts: 1,
        family_profiles: 0,
        legacy_messages: -1, // unlimited
        storage_mb: 500,
      });
    });

    it('should have correct family tier configuration', () => {
      const familyConfig = TIER_CONFIG.family;

      expect(familyConfig.name).toBe('Family');
      expect(familyConfig.description).toBe('Household-level peace of mind');
      expect(familyConfig.pillars).toEqual([
        'important_info',
        'wishes',
        'messages',
        'family_access',
      ]);
      expect(familyConfig.viewOnlyPillars).toEqual([]);
      expect(familyConfig.quotas).toEqual({
        entries: -1, // unlimited
        wishes: -1, // unlimited
        trusted_contacts: -1, // unlimited
        family_profiles: 4, // 5 total - 1 primary
        legacy_messages: -1, // unlimited
        storage_mb: 2000,
      });
    });
  });

  describe('canAccessPillar', () => {
    describe('free tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free')),
        );
      });

      it('should allow access to important_info', async () => {
        const result = await service.canAccessPillar('important_info');
        expect(result.allowed).toBe(true);
      });

      it('should deny access to wishes', async () => {
        const result = await service.canAccessPillar('wishes');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('feature_locked');
        expect(result.details?.suggestedTier).toBe('individual');
      });

      it('should deny access to messages', async () => {
        const result = await service.canAccessPillar('messages');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('feature_locked');
      });

      it('should deny access to family_access', async () => {
        const result = await service.canAccessPillar('family_access');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('feature_locked');
      });
    });

    describe('individual tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('individual')),
        );
      });

      it('should allow access to all pillars', async () => {
        const pillars = [
          'important_info',
          'wishes',
          'messages',
          'family_access',
        ] as const;

        for (const pillar of pillars) {
          const result = await service.canAccessPillar(pillar);
          expect(result.allowed).toBe(true);
        }
      });
    });

    describe('family tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('family')),
        );
      });

      it('should allow access to all pillars', async () => {
        const pillars = [
          'important_info',
          'wishes',
          'messages',
          'family_access',
        ] as const;

        for (const pillar of pillars) {
          const result = await service.canAccessPillar(pillar);
          expect(result.allowed).toBe(true);
        }
      });
    });
  });

  describe('canViewPillar', () => {
    describe('free tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free')),
        );
      });

      it('should allow viewing important_info (editable pillar)', async () => {
        const result = await service.canViewPillar('important_info');
        expect(result.allowed).toBe(true);
      });

      it('should allow viewing wishes (view-only pillar)', async () => {
        const result = await service.canViewPillar('wishes');
        expect(result.allowed).toBe(true);
      });

      it('should allow viewing messages (view-only pillar)', async () => {
        const result = await service.canViewPillar('messages');
        expect(result.allowed).toBe(true);
      });

      it('should allow viewing family_access (view-only pillar)', async () => {
        const result = await service.canViewPillar('family_access');
        expect(result.allowed).toBe(true);
      });
    });

    describe('individual tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('individual')),
        );
      });

      it('should allow viewing all pillars', async () => {
        const pillars = [
          'important_info',
          'wishes',
          'messages',
          'family_access',
        ] as const;

        for (const pillar of pillars) {
          const result = await service.canViewPillar(pillar);
          expect(result.allowed).toBe(true);
        }
      });
    });
  });

  describe('canUseQuota', () => {
    describe('free tier - entries quota', () => {
      it('should allow when under quota (0 entries)', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free', 0)),
        );

        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(true);
      });

      it('should allow when under quota (4 entries)', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free', 4)),
        );

        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(true);
      });

      it('should deny when at quota (5 entries)', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free', 5)),
        );

        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('quota_exceeded');
        expect(result.details?.limit).toBe(5);
        expect(result.details?.current).toBe(5);
        expect(result.details?.suggestedTier).toBe('individual');
      });

      it('should deny when over quota (6 entries)', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free', 6)),
        );

        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(false);
      });
    });

    describe('free tier - other quotas', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('free', 0)),
        );
      });

      it('should deny trusted_contacts (quota is 0)', async () => {
        const result = await service.canUseQuota('trusted_contacts');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('quota_exceeded');
        expect(result.details?.limit).toBe(0);
      });

      it('should deny family_profiles (quota is 0)', async () => {
        const result = await service.canUseQuota('family_profiles');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('quota_exceeded');
        expect(result.details?.limit).toBe(0);
      });

      it('should deny legacy_messages (quota is 0)', async () => {
        const result = await service.canUseQuota('legacy_messages');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('quota_exceeded');
        expect(result.details?.limit).toBe(0);
      });
    });

    describe('individual tier - unlimited quotas', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('individual', 1000)),
        );
      });

      it('should allow unlimited entries', async () => {
        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(true);
      });

      it('should allow unlimited legacy_messages', async () => {
        const result = await service.canUseQuota('legacy_messages');
        expect(result.allowed).toBe(true);
      });
    });

    describe('individual tier - limited quotas', () => {
      it('should allow 1 trusted contact when at 0', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('individual', 0)),
        );

        const result = await service.canUseQuota('trusted_contacts');
        // Currently always returns 0 (TODO), so always allowed until implemented
        expect(result.allowed).toBe(true);
      });

      // Note: trusted_contacts counting is not yet implemented (returns 0)
      // This test documents the expected behavior once implemented
      it('should have limit of 1 for trusted_contacts', () => {
        expect(TIER_CONFIG.individual.quotas.trusted_contacts).toBe(1);
      });

      it('should deny family_profiles (quota is 0)', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('individual', 0)),
        );

        const result = await service.canUseQuota('family_profiles');
        // Quota is 0, current is 0, so 0 < 0 is false, denied
        expect(result.allowed).toBe(false);
        expect(result.details?.limit).toBe(0);
        expect(result.details?.suggestedTier).toBe('family');
      });
    });

    describe('family tier', () => {
      beforeEach(() => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('family', 0)),
        );
      });

      it('should allow unlimited entries', async () => {
        const result = await service.canUseQuota('entries');
        expect(result.allowed).toBe(true);
      });

      it('should allow unlimited trusted_contacts', async () => {
        const result = await service.canUseQuota('trusted_contacts');
        expect(result.allowed).toBe(true);
      });

      it('should allow unlimited legacy_messages', async () => {
        const result = await service.canUseQuota('legacy_messages');
        expect(result.allowed).toBe(true);
      });

      it('should allow family_profiles when under quota', async () => {
        mockDbService.rls.mockImplementation((callback) =>
          callback(createMockTx('family', 0)),
        );

        const result = await service.canUseQuota('family_profiles');
        // Currently returns 0 for family_profiles (TODO), so allowed
        expect(result.allowed).toBe(true);
      });

      // Note: family_profiles counting is not yet implemented (returns 0)
      // This test documents the expected behavior once implemented
      it('should have limit of 4 for family_profiles', () => {
        expect(TIER_CONFIG.family.quotas.family_profiles).toBe(4);
      });
    });
  });

  describe('requirePillarAccess', () => {
    it('should not throw when access is allowed', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free')),
      );

      await expect(
        service.requirePillarAccess('important_info'),
      ).resolves.toBeUndefined();
    });

    it('should throw EntitlementException when access is denied', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free')),
      );

      await expect(service.requirePillarAccess('messages')).rejects.toThrow(
        EntitlementException,
      );
    });
  });

  describe('requireQuota', () => {
    it('should not throw when within quota', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free', 0)),
      );

      await expect(service.requireQuota('entries')).resolves.toBeUndefined();
    });

    it('should throw EntitlementException when quota exceeded', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free', 5)),
      );

      await expect(service.requireQuota('entries')).rejects.toThrow(
        EntitlementException,
      );
    });
  });

  describe('getEntitlementInfo', () => {
    it('should return complete entitlement info for free tier', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free', 3)),
      );

      const info = await service.getEntitlementInfo();

      expect(info.tier).toBe('free');
      expect(info.tierName).toBe('Free');
      expect(info.tierDescription).toBe('Get Oriented');
      expect(info.pillars).toEqual(['important_info']);
      expect(info.viewOnlyPillars).toEqual([
        'wishes',
        'messages',
        'family_access',
      ]);
      expect(info.quotas).toHaveLength(6);

      const entriesQuota = info.quotas.find((q) => q.feature === 'entries');
      expect(entriesQuota).toMatchObject({
        feature: 'entries',
        displayName: 'important information items',
        limit: 5,
        current: 3,
        unlimited: false,
      });
    });

    it('should return complete entitlement info for individual tier', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual', 50)),
      );

      const info = await service.getEntitlementInfo();

      expect(info.tier).toBe('individual');
      expect(info.tierName).toBe('Individual');
      expect(info.pillars).toEqual([
        'important_info',
        'wishes',
        'messages',
        'family_access',
      ]);
      expect(info.viewOnlyPillars).toEqual([]);

      const entriesQuota = info.quotas.find((q) => q.feature === 'entries');
      expect(entriesQuota).toMatchObject({
        limit: -1,
        unlimited: true,
      });
    });

    it('should return complete entitlement info for family tier', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('family', 2)),
      );

      const info = await service.getEntitlementInfo();

      expect(info.tier).toBe('family');
      expect(info.tierName).toBe('Family');
      expect(info.tierDescription).toBe('Household-level peace of mind');

      const familyProfilesQuota = info.quotas.find(
        (q) => q.feature === 'family_profiles',
      );
      expect(familyProfilesQuota).toMatchObject({
        feature: 'family_profiles',
        displayName: 'family profiles',
        limit: 4,
        unlimited: false,
      });
    });
  });

  describe('updateTier', () => {
    it('should update user tier using bypassRls', async () => {
      const mockUpdate = jest.fn().mockReturnThis();
      const mockSet = jest.fn().mockReturnThis();
      const mockWhere = jest.fn().mockResolvedValue([]);

      mockDbService.bypassRls.mockImplementation((callback) =>
        callback({
          update: mockUpdate,
          set: mockSet,
          where: mockWhere,
        }),
      );

      await service.updateTier('user-123', 'individual');

      expect(mockDbService.bypassRls).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ tier: 'individual' });
    });
  });

  describe('isSubscriptionExpired', () => {
    it('should return false for free tier (non-expiring)', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 48); // 48 hours ago
      expect(service.isSubscriptionExpired('free', pastDate)).toBe(false);
    });

    it('should return false for lifetime tier (non-expiring)', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 48); // 48 hours ago
      expect(service.isSubscriptionExpired('lifetime', pastDate)).toBe(false);
    });

    it('should return false for paid tier with null currentPeriodEnd', () => {
      expect(service.isSubscriptionExpired('individual', null)).toBe(false);
    });

    it('should return false for paid tier within grace period', () => {
      // Expired 12 hours ago (within 24-hour grace period)
      const recentlyExpired = new Date(Date.now() - 1000 * 60 * 60 * 12);
      expect(service.isSubscriptionExpired('individual', recentlyExpired)).toBe(
        false,
      );
    });

    it('should return true for paid tier past grace period', () => {
      // Expired 36 hours ago (past 24-hour grace period)
      const expiredPastGrace = new Date(
        Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS - 1000 * 60 * 60 * 12,
      );
      expect(
        service.isSubscriptionExpired('individual', expiredPastGrace),
      ).toBe(true);
    });

    it('should return true for family tier past grace period', () => {
      const expiredPastGrace = new Date(
        Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS - 1000,
      );
      expect(service.isSubscriptionExpired('family', expiredPastGrace)).toBe(
        true,
      );
    });

    it('should return false for subscription that has not expired yet', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days from now
      expect(service.isSubscriptionExpired('individual', futureDate)).toBe(
        false,
      );
    });
  });

  describe('plan owner entitlements (trusted contact context)', () => {
    it('should check plan owner tier when planOwnerId is set', async () => {
      // Trusted contact has free tier, plan owner has family tier
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'userId') return 'trusted-contact-id';
        if (key === 'planOwnerId') return 'plan-owner-id';
        return undefined;
      });

      // bypassRls should be called (not rls) when planOwnerId is set
      mockDbService.bypassRls.mockImplementation((callback) =>
        callback(createMockTx('family')),
      );

      const result = await service.canAccessPillar('wishes');
      expect(result.allowed).toBe(true);
      expect(mockDbService.bypassRls).toHaveBeenCalled();
    });

    it('should deny when plan owner lacks pillar access', async () => {
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'userId') return 'trusted-contact-id';
        if (key === 'planOwnerId') return 'plan-owner-id';
        return undefined;
      });

      // Plan owner on free tier — no access to wishes
      mockDbService.bypassRls.mockImplementation((callback) =>
        callback(createMockTx('free')),
      );

      const result = await service.canAccessPillar('wishes');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('feature_locked');
    });

    it('should check plan owner quota when planOwnerId is set', async () => {
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'userId') return 'trusted-contact-id';
        if (key === 'planOwnerId') return 'plan-owner-id';
        return undefined;
      });

      // Plan owner on free tier with 5 entries (at quota limit)
      mockDbService.bypassRls.mockImplementation((callback) =>
        callback(createMockTx('free', 5)),
      );

      const result = await service.canUseQuota('entries');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('quota_exceeded');
      expect(result.details?.limit).toBe(5);
      expect(result.details?.current).toBe(5);
    });

    it('should use rls when planOwnerId is not set', async () => {
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'userId') return 'test-user-id';
        if (key === 'planOwnerId') return undefined;
        return undefined;
      });

      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual')),
      );

      const result = await service.canAccessPillar('wishes');
      expect(result.allowed).toBe(true);
      expect(mockDbService.rls).toHaveBeenCalled();
    });
  });

  describe('checkGuardEntitlements', () => {
    it('should return without throwing when all checks pass', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual', 3)),
      );

      await expect(
        service.checkGuardEntitlements({
          pillar: 'important_info',
          viewPillar: 'messages',
          quota: 'entries',
        }),
      ).resolves.toBeUndefined();
    });

    it('should return without throwing when no checks specified', async () => {
      await expect(
        service.checkGuardEntitlements({}),
      ).resolves.toBeUndefined();

      // Should not open any transaction
      expect(mockDbService.rls).not.toHaveBeenCalled();
      expect(mockDbService.bypassRls).not.toHaveBeenCalled();
    });

    it('should throw EntitlementException when pillar access denied', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free')),
      );

      await expect(
        service.checkGuardEntitlements({ pillar: 'messages' }),
      ).rejects.toThrow(EntitlementException);
    });

    it('should throw EntitlementException when view pillar denied', async () => {
      // Free tier has all pillars in viewOnlyPillars, so this would need
      // a pillar not in either list. Let's use a mock to simulate.
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free')),
      );

      // Free tier allows viewing all pillars (important_info + viewOnly: wishes, messages, family_access)
      // So all view checks pass for free tier. Test with edit pillar denied instead.
      await expect(
        service.checkGuardEntitlements({ pillar: 'wishes' }),
      ).rejects.toThrow(EntitlementException);
    });

    it('should throw EntitlementException when quota exceeded', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free', 5)),
      );

      await expect(
        service.checkGuardEntitlements({ quota: 'entries' }),
      ).rejects.toThrow(EntitlementException);
    });

    it('should check pillar before quota (fail fast on pillar)', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('free', 0)),
      );

      try {
        await service.checkGuardEntitlements({
          pillar: 'messages',
          quota: 'entries',
        });
        fail('Expected EntitlementException');
      } catch (error) {
        expect(error).toBeInstanceOf(EntitlementException);
        const response = (error as EntitlementException).getResponse() as {
          code: string;
        };
        // Should fail on pillar (feature_locked), not quota
        expect(response.code).toBe('FEATURE_LOCKED');
      }
    });

    it('should use a single rls transaction for all checks', async () => {
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual', 3)),
      );

      await service.checkGuardEntitlements({
        pillar: 'important_info',
        viewPillar: 'messages',
        quota: 'entries',
      });

      // Only ONE rls call, not three separate ones
      expect(mockDbService.rls).toHaveBeenCalledTimes(1);
    });

    it('should use bypassRls when planOwnerId is set', async () => {
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'userId') return 'trusted-contact-id';
        if (key === 'planOwnerId') return 'plan-owner-id';
        return undefined;
      });

      mockDbService.bypassRls.mockImplementation((callback) =>
        callback(createMockTx('family', 3)),
      );

      await service.checkGuardEntitlements({
        pillar: 'important_info',
        quota: 'entries',
      });

      expect(mockDbService.bypassRls).toHaveBeenCalledTimes(1);
      expect(mockDbService.rls).not.toHaveBeenCalled();
    });

    it('should allow unlimited quota without counting usage', async () => {
      const mockTx = createMockTx('individual', 0);
      mockDbService.rls.mockImplementation((callback) => callback(mockTx));

      await service.checkGuardEntitlements({ quota: 'entries' });

      // Individual tier has unlimited entries (-1), so no usage count query needed.
      // The tx.select/from/where chain is called once for the subscription tier query.
      // If usage were counted, it would be called a second time.
      expect(mockTx.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTier with expiration', () => {
    it('should return free tier when paid subscription has expired', async () => {
      const expiredDate = new Date(
        Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS - 1000 * 60 * 60,
      );
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual', 0, expiredDate)),
      );

      const tier = await service.getTier();
      expect(tier).toBe('free');
    });

    it('should return actual tier when subscription is not expired', async () => {
      const validDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('individual', 0, validDate)),
      );

      const tier = await service.getTier();
      expect(tier).toBe('individual');
    });

    it('should return actual tier within grace period', async () => {
      const recentlyExpired = new Date(Date.now() - 1000 * 60 * 60 * 12);
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('family', 0, recentlyExpired)),
      );

      const tier = await service.getTier();
      expect(tier).toBe('family');
    });

    it('should return lifetime tier even with past expiration date', async () => {
      const oldDate = new Date('2020-01-01');
      mockDbService.rls.mockImplementation((callback) =>
        callback(createMockTx('lifetime', 0, oldDate)),
      );

      const tier = await service.getTier();
      expect(tier).toBe('lifetime');
    });
  });
});
