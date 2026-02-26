import { Injectable } from '@nestjs/common';
import { count, eq, sum } from 'drizzle-orm';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { entries, files, plans, subscriptions, wishes } from '../schema';
import {
  NON_EXPIRING_TIERS,
  PILLAR_DISPLAY_NAMES,
  QUOTA_DISPLAY_NAMES,
  SUBSCRIPTION_GRACE_PERIOD_MS,
  TIER_CONFIG,
  UPGRADE_PATH,
} from './entitlements.config';
import { EntitlementException } from './entitlements.exception';
import {
  EntitlementInfo,
  EntitlementResult,
  Pillar,
  QuotaFeature,
  SubscriptionTier,
} from './entitlements.types';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers: resolve whose entitlements to check
  // ---------------------------------------------------------------------------

  /**
   * Get the user ID whose entitlements should be checked.
   *
   * When a trusted contact operates on a shared plan, planOwnerId is set in CLS
   * by PlanAccessGuard. In that case we check the PLAN OWNER's entitlements,
   * not the trusted contact's.
   */
  private getEntitlementUserId(): string {
    const planOwnerId = this.cls.get('planOwnerId');
    if (planOwnerId) return planOwnerId;

    const userId = this.cls.get('userId');
    if (!userId) throw new Error('No user ID in context');
    return userId;
  }

  /**
   * Whether we're checking entitlements for a plan owner on behalf of a
   * trusted contact. When true, queries must use bypassRls because the
   * current RLS context is the trusted contact's, not the plan owner's.
   */
  private isCheckingPlanOwner(): boolean {
    return !!this.cls.get('planOwnerId');
  }

  /**
   * Run a query function using the appropriate transaction context.
   *
   * When checking plan owner entitlements (trusted contact context), we need
   * bypassRls because the subscriptions/plans tables have RLS policies that
   * filter by app.user_id (which is the trusted contact, not the plan owner).
   *
   * For owner's own requests, we use the passed transaction (already in correct
   * RLS context).
   */
  private async withEntitlementTx<T>(
    tx: DrizzleTransaction,
    fn: (effectiveTx: DrizzleTransaction, userId: string) => Promise<T>,
  ): Promise<T> {
    const userId = this.getEntitlementUserId();

    if (this.isCheckingPlanOwner()) {
      // Trusted contact: query plan owner's data in a separate bypassRls tx
      return this.db.bypassRls(async (bypassTx) => fn(bypassTx, userId));
    }

    return fn(tx, userId);
  }

  // ---------------------------------------------------------------------------
  // Pure evaluation: check access against tier config (no DB queries)
  // ---------------------------------------------------------------------------

  private evaluatePillarAccess(
    tier: SubscriptionTier,
    pillar: Pillar,
  ): EntitlementResult {
    const config = TIER_CONFIG[tier];
    if (config.pillars.includes(pillar)) {
      return { allowed: true };
    }
    const suggestedTier = UPGRADE_PATH[tier];
    return {
      allowed: false,
      reason: 'feature_locked',
      message: `${PILLAR_DISPLAY_NAMES[pillar]} is not available on the ${config.name} plan`,
      details: {
        feature: pillar,
        tier,
        upgradeRequired: true,
        suggestedTier,
      },
    };
  }

  private evaluateViewPillarAccess(
    tier: SubscriptionTier,
    pillar: Pillar,
  ): EntitlementResult {
    const config = TIER_CONFIG[tier];
    if (
      config.pillars.includes(pillar) ||
      config.viewOnlyPillars.includes(pillar)
    ) {
      return { allowed: true };
    }
    const suggestedTier = UPGRADE_PATH[tier];
    return {
      allowed: false,
      reason: 'feature_locked',
      message: `${PILLAR_DISPLAY_NAMES[pillar]} is not available on the ${config.name} plan`,
      details: {
        feature: pillar,
        tier,
        upgradeRequired: true,
        suggestedTier,
      },
    };
  }

  private evaluateQuota(
    tier: SubscriptionTier,
    feature: QuotaFeature,
    current: number,
  ): EntitlementResult {
    const config = TIER_CONFIG[tier];
    const limit = config.quotas[feature];
    if (limit === -1 || current < limit) {
      return { allowed: true };
    }
    const suggestedTier = UPGRADE_PATH[tier];
    return {
      allowed: false,
      reason: 'quota_exceeded',
      message: `You have reached the maximum number of ${QUOTA_DISPLAY_NAMES[feature]} for your plan`,
      details: {
        feature,
        tier,
        limit,
        current,
        upgradeRequired: true,
        suggestedTier,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Tier
  // ---------------------------------------------------------------------------

  /**
   * Get the current user's subscription tier.
   * Creates a 'free' subscription if none exists.
   */
  async getTier(): Promise<SubscriptionTier> {
    return this.db.rls(async (tx) => {
      return this.getTierInTx(tx);
    });
  }

  /**
   * Get tier within an existing transaction.
   * Checks for subscription expiration and returns 'free' if expired.
   *
   * When planOwnerId is set in CLS (trusted contact context), this checks the
   * plan OWNER's tier via a separate bypassRls transaction.
   */
  async getTierInTx(tx: DrizzleTransaction): Promise<SubscriptionTier> {
    return this.withEntitlementTx(tx, async (effectiveTx, userId) => {
      const [subscription] = await effectiveTx
        .select({
          tier: subscriptions.tier,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));

      if (!subscription) {
        return 'free';
      }

      const tier = subscription.tier as SubscriptionTier;

      if (this.isSubscriptionExpired(tier, subscription.currentPeriodEnd)) {
        return 'free';
      }

      return tier;
    });
  }

  /**
   * Check if a subscription has expired based on tier and currentPeriodEnd.
   * Non-expiring tiers (free, lifetime) always return false.
   * Paid tiers are expired if currentPeriodEnd + grace period < now.
   */
  isSubscriptionExpired(
    tier: SubscriptionTier,
    currentPeriodEnd: Date | null,
  ): boolean {
    // Non-expiring tiers never expire
    if (NON_EXPIRING_TIERS.includes(tier)) {
      return false;
    }

    // Paid tiers without an end date are not expired (shouldn't happen normally)
    if (!currentPeriodEnd) {
      return false;
    }

    // Check if we're past the grace period
    const expirationWithGrace =
      currentPeriodEnd.getTime() + SUBSCRIPTION_GRACE_PERIOD_MS;
    return Date.now() > expirationWithGrace;
  }

  // ---------------------------------------------------------------------------
  // Pillar access
  // ---------------------------------------------------------------------------

  /**
   * Check if the user can edit/create content in a specific pillar.
   *
   * When planOwnerId is set (trusted contact context), checks the plan
   * owner's tier via bypassRls.
   */
  async canAccessPillar(pillar: Pillar): Promise<EntitlementResult> {
    if (this.isCheckingPlanOwner()) {
      return this.db.bypassRls(async (tx) => {
        return this.canAccessPillarInTx(tx, pillar);
      });
    }
    return this.db.rls(async (tx) => {
      return this.canAccessPillarInTx(tx, pillar);
    });
  }

  /**
   * Check pillar edit access within an existing transaction.
   */
  async canAccessPillarInTx(
    tx: DrizzleTransaction,
    pillar: Pillar,
  ): Promise<EntitlementResult> {
    const tier = await this.getTierInTx(tx);
    return this.evaluatePillarAccess(tier, pillar);
  }

  /**
   * Check if the user can view a specific pillar (view-only or full access).
   *
   * When planOwnerId is set (trusted contact context), checks the plan
   * owner's tier via bypassRls.
   */
  async canViewPillar(pillar: Pillar): Promise<EntitlementResult> {
    if (this.isCheckingPlanOwner()) {
      return this.db.bypassRls(async (tx) => {
        return this.canViewPillarInTx(tx, pillar);
      });
    }
    return this.db.rls(async (tx) => {
      return this.canViewPillarInTx(tx, pillar);
    });
  }

  /**
   * Check pillar view access within an existing transaction.
   */
  async canViewPillarInTx(
    tx: DrizzleTransaction,
    pillar: Pillar,
  ): Promise<EntitlementResult> {
    const tier = await this.getTierInTx(tx);
    return this.evaluateViewPillarAccess(tier, pillar);
  }

  // ---------------------------------------------------------------------------
  // Quota
  // ---------------------------------------------------------------------------

  /**
   * Check if the user can use more of a quota feature.
   *
   * When planOwnerId is set (trusted contact context), checks the plan
   * owner's quota via bypassRls.
   */
  async canUseQuota(feature: QuotaFeature): Promise<EntitlementResult> {
    if (this.isCheckingPlanOwner()) {
      return this.db.bypassRls(async (tx) => {
        return this.canUseQuotaInTx(tx, feature);
      });
    }
    return this.db.rls(async (tx) => {
      return this.canUseQuotaInTx(tx, feature);
    });
  }

  /**
   * Check quota within an existing transaction.
   */
  async canUseQuotaInTx(
    tx: DrizzleTransaction,
    feature: QuotaFeature,
  ): Promise<EntitlementResult> {
    const tier = await this.getTierInTx(tx);
    const config = TIER_CONFIG[tier];
    const limit = config.quotas[feature];

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true };
    }

    const current = await this.getUsageInTx(tx, feature);
    return this.evaluateQuota(tier, feature, current);
  }

  /**
   * Count usage directly within a transaction. Takes explicit userId parameter
   * to avoid nesting withEntitlementTx when already in the right context.
   */
  private async countUsageInTx(
    tx: DrizzleTransaction,
    userId: string,
    feature: QuotaFeature,
  ): Promise<number> {
    switch (feature) {
      case 'entries': {
        const [result] = await tx
          .select({ count: count() })
          .from(entries)
          .innerJoin(plans, eq(entries.planId, plans.id))
          .where(eq(plans.userId, userId));
        return result?.count ?? 0;
      }

      case 'wishes': {
        const [result] = await tx
          .select({ count: count() })
          .from(wishes)
          .innerJoin(plans, eq(wishes.planId, plans.id))
          .where(eq(plans.userId, userId));
        return result?.count ?? 0;
      }

      case 'trusted_contacts':
        // TODO: Implement when trusted_contacts table exists
        return 0;

      case 'family_profiles':
        // TODO: Implement when family_profiles table exists
        return 0;

      case 'legacy_messages':
        // TODO: Implement when messages table exists
        return 0;

      case 'storage_mb': {
        const [entryFilesResult] = await tx
          .select({ totalBytes: sum(files.sizeBytes) })
          .from(files)
          .innerJoin(entries, eq(files.entryId, entries.id))
          .innerJoin(plans, eq(entries.planId, plans.id))
          .where(eq(plans.userId, userId));

        const [wishFilesResult] = await tx
          .select({ totalBytes: sum(files.sizeBytes) })
          .from(files)
          .innerJoin(wishes, eq(files.wishId, wishes.id))
          .innerJoin(plans, eq(wishes.planId, plans.id))
          .where(eq(plans.userId, userId));

        const entryBytes = Number(entryFilesResult?.totalBytes ?? 0);
        const wishBytes = Number(wishFilesResult?.totalBytes ?? 0);
        const totalBytes = entryBytes + wishBytes;
        return Math.ceil(totalBytes / (1024 * 1024));
      }

      default:
        return 0;
    }
  }

  /**
   * Get current usage for a quota feature.
   * Delegates to countUsageInTx via withEntitlementTx for correct RLS context.
   */
  private async getUsageInTx(
    tx: DrizzleTransaction,
    feature: QuotaFeature,
  ): Promise<number> {
    return this.withEntitlementTx(tx, (effectiveTx, userId) =>
      this.countUsageInTx(effectiveTx, userId, feature),
    );
  }

  // ---------------------------------------------------------------------------
  // Combined guard check (single transaction)
  // ---------------------------------------------------------------------------

  /**
   * Run all entitlement checks for a guard in a single transaction.
   * This avoids opening separate transactions for pillar and quota checks,
   * reducing DB round trips from 3+ down to 1.
   *
   * Throws EntitlementException on the first failing check.
   */
  async checkGuardEntitlements(params: {
    pillar?: Pillar;
    viewPillar?: Pillar;
    quota?: QuotaFeature;
  }): Promise<void> {
    const { pillar, viewPillar, quota } = params;

    // Nothing to check
    if (!pillar && !viewPillar && !quota) return;

    const userId = this.getEntitlementUserId();

    const runChecks = async (tx: DrizzleTransaction) => {
      // Fetch tier ONCE
      const [subscription] = await tx
        .select({
          tier: subscriptions.tier,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));

      let tier: SubscriptionTier = 'free';
      if (subscription) {
        const rawTier = subscription.tier as SubscriptionTier;
        tier = this.isSubscriptionExpired(
          rawTier,
          subscription.currentPeriodEnd,
        )
          ? 'free'
          : rawTier;
      }

      // Check pillar edit access
      if (pillar) {
        const result = this.evaluatePillarAccess(tier, pillar);
        if (!result.allowed) throw new EntitlementException(result);
      }

      // Check pillar view access
      if (viewPillar) {
        const result = this.evaluateViewPillarAccess(tier, viewPillar);
        if (!result.allowed) throw new EntitlementException(result);
      }

      // Check quota
      if (quota) {
        const config = TIER_CONFIG[tier];
        const limit = config.quotas[quota];
        if (limit !== -1) {
          const current = await this.countUsageInTx(tx, userId, quota);
          const result = this.evaluateQuota(tier, quota, current);
          if (!result.allowed) throw new EntitlementException(result);
        }
      }
    };

    if (this.isCheckingPlanOwner()) {
      await this.db.bypassRls(runChecks);
    } else {
      await this.db.rls(runChecks);
    }
  }

  // ---------------------------------------------------------------------------
  // Require helpers (throw on failure)
  // ---------------------------------------------------------------------------

  /**
   * Require pillar access or throw an exception.
   */
  async requirePillarAccess(pillar: Pillar): Promise<void> {
    const result = await this.canAccessPillar(pillar);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  /**
   * Require pillar edit access within a transaction or throw an exception.
   */
  async requirePillarAccessInTx(
    tx: DrizzleTransaction,
    pillar: Pillar,
  ): Promise<void> {
    const result = await this.canAccessPillarInTx(tx, pillar);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  /**
   * Require pillar view access or throw an exception.
   */
  async requireViewPillarAccess(pillar: Pillar): Promise<void> {
    const result = await this.canViewPillar(pillar);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  /**
   * Require pillar view access within a transaction or throw an exception.
   */
  async requireViewPillarAccessInTx(
    tx: DrizzleTransaction,
    pillar: Pillar,
  ): Promise<void> {
    const result = await this.canViewPillarInTx(tx, pillar);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  /**
   * Require quota availability or throw an exception.
   */
  async requireQuota(feature: QuotaFeature): Promise<void> {
    const result = await this.canUseQuota(feature);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  /**
   * Require quota availability within a transaction or throw an exception.
   */
  async requireQuotaInTx(
    tx: DrizzleTransaction,
    feature: QuotaFeature,
  ): Promise<void> {
    const result = await this.canUseQuotaInTx(tx, feature);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }

  // ---------------------------------------------------------------------------
  // Info & status
  // ---------------------------------------------------------------------------

  /**
   * Get full entitlement info for the current user.
   * Useful for displaying in the UI.
   */
  async getEntitlementInfo(): Promise<EntitlementInfo> {
    return this.db.rls(async (tx) => {
      const tier = await this.getTierInTx(tx);
      const config = TIER_CONFIG[tier];

      const quotas = await Promise.all(
        (Object.keys(config.quotas) as QuotaFeature[]).map(async (feature) => {
          const limit = config.quotas[feature];
          const current = await this.getUsageInTx(tx, feature);
          return {
            feature,
            displayName: QUOTA_DISPLAY_NAMES[feature],
            limit,
            current,
            unlimited: limit === -1,
          };
        }),
      );

      return {
        tier,
        tierName: config.name,
        tierDescription: config.description,
        pillars: config.pillars,
        viewOnlyPillars: config.viewOnlyPillars,
        quotas,
      };
    });
  }

  /**
   * Update a user's subscription tier.
   * Used by webhook handlers when processing Stripe events.
   */
  async updateTier(userId: string, tier: SubscriptionTier): Promise<void> {
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ tier })
        .where(eq(subscriptions.userId, userId));
    });
  }

  /**
   * Get quota status for a specific feature.
   * Returns limit, current usage, and remaining count.
   */
  async getQuotaStatus(feature: QuotaFeature): Promise<{
    limit: number;
    current: number;
    remaining: number | null;
    unlimited: boolean;
  }> {
    return this.db.rls(async (tx) => {
      return this.getQuotaStatusInTx(tx, feature);
    });
  }

  /**
   * Get quota status within an existing transaction.
   */
  async getQuotaStatusInTx(
    tx: DrizzleTransaction,
    feature: QuotaFeature,
  ): Promise<{
    limit: number;
    current: number;
    remaining: number | null;
    unlimited: boolean;
  }> {
    const tier = await this.getTierInTx(tx);
    const config = TIER_CONFIG[tier];
    const limit = config.quotas[feature];
    const current = await this.getUsageInTx(tx, feature);
    const unlimited = limit === -1;

    return {
      limit,
      current,
      remaining: unlimited ? null : Math.max(0, limit - current),
      unlimited,
    };
  }

  /**
   * Check if a file of a given size can be uploaded without exceeding storage quota.
   * Returns an EntitlementResult indicating whether the upload is allowed.
   *
   * This differs from canUseQuotaInTx('storage_mb') which only checks if any
   * space remains (current < limit). This method checks if the specific file
   * fits: (current + fileSizeMb) <= limit.
   *
   * Note: File sizes are converted to MB using Math.ceil, so a 1-byte file
   * counts as 1 MB. This is intentionally conservative.
   */
  async canUploadFileSizeInTx(
    tx: DrizzleTransaction,
    sizeBytes: number,
  ): Promise<EntitlementResult> {
    const tier = await this.getTierInTx(tx);
    const config = TIER_CONFIG[tier];
    const limitMb = config.quotas.storage_mb;

    // -1 means unlimited
    if (limitMb === -1) {
      return { allowed: true };
    }

    const currentMb = await this.getUsageInTx(tx, 'storage_mb');
    const fileSizeMb = Math.ceil(sizeBytes / (1024 * 1024));

    if (currentMb + fileSizeMb <= limitMb) {
      return { allowed: true };
    }

    const suggestedTier = UPGRADE_PATH[tier];
    return {
      allowed: false,
      reason: 'quota_exceeded',
      message: `This file would exceed your storage limit. You have ${Math.max(0, limitMb - currentMb)} MB remaining of ${limitMb} MB.`,
      details: {
        feature: 'storage_mb',
        tier,
        limit: limitMb,
        current: currentMb,
        requested: fileSizeMb,
        upgradeRequired: true,
        suggestedTier,
      },
    };
  }

  /**
   * Require that a file of a given size can be uploaded or throw an exception.
   */
  async requireFileSizeQuotaInTx(
    tx: DrizzleTransaction,
    sizeBytes: number,
  ): Promise<void> {
    const result = await this.canUploadFileSizeInTx(tx, sizeBytes);
    if (!result.allowed) {
      throw new EntitlementException(result);
    }
  }
}
