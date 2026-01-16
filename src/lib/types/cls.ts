import { ClsStore } from 'nestjs-cls';

export interface ApiClsStore extends ClsStore {
  userId?: string;
}
