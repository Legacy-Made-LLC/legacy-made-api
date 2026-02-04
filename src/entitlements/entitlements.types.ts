export type SubscriptionTier = 'free' | 'individual' | 'family' | 'lifetime';

export type Pillar =
  | 'important_info' // Entries
  | 'wishes' // Wishes & Guidance
  | 'messages' // Legacy Messages
  | 'family_access'; // Trusted Contacts

export type QuotaFeature =
  | 'entries' // Important Information items
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
}
