import {
  QuotaFeature,
  SubscriptionTier,
  TierConfig,
} from './entitlements.types';

export const TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Free',
    description: 'Get Oriented',
    pillars: ['important_info'], // Can only add Important Information
    viewOnlyPillars: ['wishes', 'messages', 'family_access'], // Can view all sections
    quotas: {
      entries: 5, // Up to 5 Important Information items
      trusted_contacts: 0, // No trusted contacts
      family_profiles: 0, // No additional family profiles
      legacy_messages: 0, // No legacy messages
      storage_mb: 0, // No uploads
    },
  },
  individual: {
    name: 'Individual',
    description: 'Full individual coverage',
    pillars: ['important_info', 'wishes', 'messages', 'family_access'],
    viewOnlyPillars: [],
    quotas: {
      entries: -1, // Unlimited Important Information
      trusted_contacts: 1, // 1 trusted contact (view-only)
      family_profiles: 0, // No additional family profiles
      legacy_messages: -1, // Unlimited legacy messages
      storage_mb: 500, // Document & media uploads
    },
  },
  family: {
    name: 'Family',
    description: 'Household-level peace of mind',
    pillars: ['important_info', 'wishes', 'messages', 'family_access'],
    viewOnlyPillars: [],
    quotas: {
      entries: -1, // Unlimited Important Information
      trusted_contacts: -1, // Multiple trusted contacts
      family_profiles: 4, // Up to 4 additional profiles (5 total people)
      legacy_messages: -1, // Unlimited legacy messages
      storage_mb: 2000, // More storage
    },
  },
  lifetime: {
    name: 'Lifetime',
    description: 'Early Access lifetime membership',
    pillars: ['important_info', 'wishes', 'messages', 'family_access'],
    viewOnlyPillars: [],
    quotas: {
      entries: -1, // Unlimited Important Information
      trusted_contacts: -1, // Multiple trusted contacts
      family_profiles: 4, // Up to 4 additional profiles (5 total people)
      legacy_messages: -1, // Unlimited legacy messages
      storage_mb: 2000, // More storage
    },
  },
};

export const UPGRADE_PATH: Partial<Record<SubscriptionTier, SubscriptionTier>> =
  {
    free: 'individual',
    individual: 'family',
  };

export const QUOTA_DISPLAY_NAMES: Record<QuotaFeature, string> = {
  entries: 'important information items',
  trusted_contacts: 'trusted contacts',
  family_profiles: 'family profiles',
  legacy_messages: 'legacy messages',
  storage_mb: 'storage (MB)',
};

export const PILLAR_DISPLAY_NAMES: Record<string, string> = {
  important_info: 'Important Information',
  wishes: 'Wishes & Guidance',
  messages: 'Legacy Messages',
  family_access: 'Trusted Contacts',
};
