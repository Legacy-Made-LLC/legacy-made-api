import { ClsStore } from 'nestjs-cls';

export type PlanAccessRole = 'owner' | 'trusted_contact';
export type AccessLevel =
  | 'full_edit'
  | 'full_view'
  | 'limited_view'
  | 'view_only';

export interface ApiClsStore extends ClsStore {
  userId?: string;
  planAccessRole?: PlanAccessRole;
  planAccessLevel?: AccessLevel;
}
