export type SubscriptionTier = 'free' | 'individual' | 'family' | 'lifetime';

/**
 * Where the user's tier comes from. Drives paywall + "Manage Subscription"
 * UI on the mobile app: only `d2c` should see RC upgrade affordances.
 *
 * - `d2c`: paid RevenueCat subscription (App Store / Play Store)
 * - `b2b`: active seat on an active master subscription (group license)
 * - `lifetime`: manually-granted lifetime tier on the D2C row
 * - `none`: free tier with no active subscription anywhere
 */
export type EntitlementSource = 'd2c' | 'b2b' | 'lifetime' | 'none';

export interface EffectiveTier {
  tier: SubscriptionTier;
  source: EntitlementSource;
  /** Set only when source === 'b2b'. */
  masterSubscriptionId?: string;
  /** Master subscription `display_name`. Set only when source === 'b2b'. */
  providerName?: string;
}

/**
 * Webhook-derived lifecycle state for a paid subscription. NULL for users
 * who have never had a paid subscription (free tier by default). Mirrors
 * the CHECK constraint on subscriptions.status.
 */
export type SubscriptionStatus = 'active' | 'in_grace_period' | 'expired';

export type Pillar =
  | 'important_info' // Entries
  | 'wishes' // Wishes & Guidance
  | 'messages' // Legacy Messages
  | 'family_access'; // Trusted Contacts

export type QuotaFeature =
  | 'entries' // Important Information items
  | 'wishes' // Wishes & Guidance items
  | 'trusted_contacts' // People who can view your plan
  | 'family_profiles' // Additional family members on the plan
  | 'legacy_messages' // Written/audio/video messages
  | 'storage_mb'; // Document & media storage

export interface TierConfig {
  name: string;
  description: string;
  pillars: Pillar[]; // Pillars user can edit/create content in
  viewOnlyPillars: Pillar[]; // Pillars user can view but not edit
  quotas: Record<QuotaFeature, number>; // -1 = unlimited
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: 'feature_locked' | 'quota_exceeded';
  message?: string;
  details?: {
    feature: Pillar | QuotaFeature;
    tier: SubscriptionTier;
    limit?: number;
    current?: number;
    requested?: number; // Amount being requested (e.g., file size in MB)
    upgradeRequired: boolean;
    suggestedTier?: SubscriptionTier;
  };
}

export interface EntitlementInfo {
  tier: SubscriptionTier;
  tierName: string;
  tierDescription: string;
  pillars: Pillar[]; // Pillars user can edit/create in
  viewOnlyPillars: Pillar[]; // Pillars user can only view
  quotas: {
    feature: QuotaFeature;
    displayName: string;
    limit: number;
    current: number;
    unlimited: boolean;
  }[];
  /**
   * Lifecycle metadata derived from the RC webhook pipeline. Optional so
   * older clients that ignore it continue to work. `null` status + `null`
   * currentPeriodEnd is the default for free/never-paid users.
   *
   * Always reflects the D2C subscription state. A B2B member may still
   * have a (now-redundant) personal RC sub — clients gate on
   * `entitlementSource` rather than this field to decide whether to show
   * "Manage Subscription".
   */
  subscription: {
    status: SubscriptionStatus | null;
    /** ISO date string; null when no paid period is in force. */
    currentPeriodEnd: string | null;
    /**
     * True when the user has cancelled but retains access through
     * currentPeriodEnd. UI can surface "cancels on X" without changing
     * tier/access.
     */
    cancellationPending: boolean;
  };
  /** Which lane granted the effective tier. */
  entitlementSource: EntitlementSource;
  /** Set when entitlementSource === 'b2b'. */
  masterSubscriptionId?: string;
  /** Master subscription `display_name`; set when entitlementSource === 'b2b'. */
  providerName?: string;
}
