import { AccessLevel } from '../lib/types/cls';
import {
  getPermissionsForAccessLevel,
  PlanPermissions,
} from './plan-permissions';

describe('getPermissionsForAccessLevel', () => {
  it('full_edit: read and write access to all resources', () => {
    const permissions = getPermissionsForAccessLevel('full_edit');

    expect(permissions).toEqual<PlanPermissions>({
      entries: { read: true, write: true },
      wishes: { read: true, write: true },
      messages: { read: true, write: true },
      progress: { read: true, write: true },
    });
  });

  it('full_view: read-only access to all resources', () => {
    const permissions = getPermissionsForAccessLevel('full_view');

    expect(permissions).toEqual<PlanPermissions>({
      entries: { read: true, write: false },
      wishes: { read: true, write: false },
      messages: { read: true, write: false },
      progress: { read: true, write: false },
    });
  });

  it('limited_view: read access to wishes, messages, and progress only', () => {
    const permissions = getPermissionsForAccessLevel('limited_view');

    expect(permissions).toEqual<PlanPermissions>({
      entries: { read: false, write: false },
      wishes: { read: true, write: false },
      messages: { read: true, write: false },
      progress: { read: true, write: false },
    });
  });

  it('returns correct permissions for all access levels', () => {
    const levels: AccessLevel[] = ['full_edit', 'full_view', 'limited_view'];

    for (const level of levels) {
      const permissions = getPermissionsForAccessLevel(level);
      expect(permissions).toBeDefined();
      expect(permissions.entries).toBeDefined();
      expect(permissions.wishes).toBeDefined();
      expect(permissions.messages).toBeDefined();
      expect(permissions.progress).toBeDefined();
    }
  });
});
