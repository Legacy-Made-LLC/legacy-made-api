import { Injectable } from '@nestjs/common';
import { count, eq, sum } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { ApiClsStore } from '../lib/types/cls';
import { entries, files, plans, subscriptions } from '../schema';
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
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

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
   */
  async getTierInTx(tx: DrizzleTransaction): Promise<SubscriptionTier> {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new Error('No user ID in context');
    }

    const [subscription] = await tx
      .select({
        tier: subscriptions.tier,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));

    if (!subscription) {
      // This shouldn't happen if user creation flow is correct,
      // but handle it gracefully by returning free tier
      return 'free';
    }

    const tier = subscription.tier as SubscriptionTier;

    // Check if subscription has expired (with grace period)
    if (this.isSubscriptionExpired(tier, subscription.currentPeriodEnd)) {
      return 'free';
    }

    return tier;
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

  /**
   * Check if the user can edit/create content in a specific pillar.
   */
  async canAccessPillar(pillar: Pillar): Promise<EntitlementResult> {
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

  /**
   * Check if the user can view a specific pillar (view-only or full access).
   */
  async canViewPillar(pillar: Pillar): Promise<EntitlementResult> {
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
    const config = TIER_CONFIG[tier];

    // Can view if user has full access OR view-only access
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

  /**
   * Check if the user can use more of a quota feature.
   */
  async canUseQuota(feature: QuotaFeature): Promise<EntitlementResult> {
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

    if (current < limit) {
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

  /**
   * Get current usage for a quota feature.
   * Returns counts from the relevant tables.
   */
  private async getUsageInTx(
    tx: DrizzleTransaction,
    feature: QuotaFeature,
  ): Promise<number> {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new Error('No user ID in context');
    }

    switch (feature) {
      case 'entries': {
        // Count all entries across user's plans
        const [result] = await tx
          .select({ count: count() })
          .from(entries)
          .innerJoin(plans, eq(entries.planId, plans.id))
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
        // Sum file sizes across all user's entries (via entry → plan → user)
        const [result] = await tx
          .select({ totalBytes: sum(files.sizeBytes) })
          .from(files)
          .innerJoin(entries, eq(files.entryId, entries.id))
          .innerJoin(plans, eq(entries.planId, plans.id))
          .where(eq(plans.userId, userId));
        const totalBytes = Number(result?.totalBytes ?? 0);
        // Convert bytes to MB (quota is in MB)
        return Math.ceil(totalBytes / (1024 * 1024));
      }

      default:
        return 0;
    }
  }

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
