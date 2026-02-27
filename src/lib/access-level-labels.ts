import { AccessLevel } from './types/cls';

/**
 * Display labels for access levels. This is the single source of truth
 * for how access level values are presented to users in emails and other UI.
 */
export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  full_edit: 'Can Edit',
  full_view: 'View Only',
  limited_view: 'Limited View',
};

/**
 * Descriptions of what each access level grants, written from the
 * perspective of the contact (e.g., "can now view and edit your plan").
 */
export const ACCESS_LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
  full_edit: 'can now view and edit your plan',
  full_view: 'can now view all information in your plan',
  limited_view: 'can now view your wishes and messages',
};

/**
 * Descriptions used in invitation emails, written from the perspective
 * of what the contact is being invited to do.
 */
export const ACCESS_LEVEL_INVITATION_DESCRIPTIONS: Record<
  Exclude<AccessLevel, 'full_edit'>,
  string
> = {
  full_view:
    'view all information in their legacy plan, including important entries, wishes, and messages',
  limited_view: 'view wishes and personal messages',
};
