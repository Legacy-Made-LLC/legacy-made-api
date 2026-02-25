import { AccessLevel } from '../lib/types/cls';

export type PlanResource = 'entries' | 'wishes' | 'messages' | 'progress';

export interface ResourcePermission {
  read: boolean;
  write: boolean;
}

export type PlanPermissions = Record<PlanResource, ResourcePermission>;

const PERMISSIONS_MATRIX: Record<AccessLevel, PlanPermissions> = {
  full_edit: {
    entries: { read: true, write: true },
    wishes: { read: true, write: true },
    messages: { read: true, write: true },
    progress: { read: true, write: true },
  },
  full_view: {
    entries: { read: true, write: false },
    wishes: { read: true, write: false },
    messages: { read: true, write: false },
    progress: { read: true, write: false },
  },
  limited_view: {
    entries: { read: false, write: false },
    wishes: { read: true, write: false },
    messages: { read: true, write: false },
    progress: { read: true, write: false },
  },
};

export function getPermissionsForAccessLevel(
  accessLevel: AccessLevel,
): PlanPermissions {
  return PERMISSIONS_MATRIX[accessLevel];
}
