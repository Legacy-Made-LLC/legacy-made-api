import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DrizzleTransaction } from '../db/db.service';
import { ApiClsStore } from '../lib/types/cls';
import { planActivityLog } from '../schema';

export interface LogActivityParams {
  planId: string;
  action: 'created' | 'updated' | 'deleted';
  resourceType: 'entry' | 'wish' | 'message' | 'trusted_contact';
  resourceId?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly cls: ClsService<ApiClsStore>) {}

  /**
   * Log an activity within an existing transaction.
   * Reads actor info from CLS context.
   */
  async log(tx: DrizzleTransaction, params: LogActivityParams): Promise<void> {
    const userId = this.cls.get('userId');
    if (!userId) return;

    const actorType = this.cls.get('planAccessRole') ?? 'owner';

    await tx.insert(planActivityLog).values({
      planId: params.planId,
      actorUserId: userId,
      actorType,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details,
    });
  }
}
