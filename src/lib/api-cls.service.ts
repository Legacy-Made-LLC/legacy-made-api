import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AccessLevel, ApiClsStore, PlanAccessRole } from './types/cls';

@Injectable()
export class ApiClsService {
  constructor(private readonly cls: ClsService<ApiClsStore>) {}

  get<K extends keyof ApiClsStore>(key: K): ApiClsStore[K] {
    return this.cls.get(key);
  }

  set<K extends keyof ApiClsStore>(key: K, value: ApiClsStore[K]): void {
    this.cls.set(key, value);
  }

  requireUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new UnauthorizedException('User context not available');
    }
    return userId;
  }

  requirePlanAccessRole(): PlanAccessRole {
    const role = this.cls.get('planAccessRole');
    if (!role) {
      throw new UnauthorizedException('Plan access context not available');
    }
    return role;
  }

  requirePlanAccessLevel(): AccessLevel {
    const level = this.cls.get('planAccessLevel');
    if (!level) {
      throw new UnauthorizedException('Plan access context not available');
    }
    return level;
  }
}
