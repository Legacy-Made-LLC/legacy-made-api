import { ClsStore } from 'nestjs-cls';

export type PlanAccessRole = 'owner' | 'trusted_contact';
export type AccessLevel = 'full_edit' | 'full_view' | 'limited_view';

export interface ApiClsStore extends ClsStore {
  userId?: string;
  planAccessRole?: PlanAccessRole;
  planAccessLevel?: AccessLevel;
  /** The plan owner's user ID. Set by PlanAccessGuard for all plan-scoped requests. */
  planOwnerId?: string;
  /** Client IP address. Set by RequestContextInterceptor. */
  ipAddress?: string;
  /** Client user-agent string. Set by RequestContextInterceptor. */
  userAgent?: string;
}
