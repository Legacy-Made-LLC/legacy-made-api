import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  MasterSubscription,
  masterSubscriptionAuditLog,
  masterSubscriptions,
} from '../schema';

/**
 * Daily cron that flips `active → past_due` on master subscriptions whose
 * `current_period_end` is in the past. For MVP, billing is manual — admins
 * set `current_period_end` when they invoice; this cron enforces the
 * cutoff so members lose B2B entitlements automatically without admin
 * intervention.
 *
 * Phase 2 replaces this with Stripe webhook-driven status updates; this
 * service remains as a safety net for stale `current_period_end` values
 * that didn't get refreshed via the webhook path.
 *
 * The cron is idempotent — re-running does nothing once status flips, so
 * a missed schedule day catches up automatically on the next run.
 */
@Injectable()
export class MasterSubscriptionsLapseService {
  private readonly logger = new Logger(MasterSubscriptionsLapseService.name);

  constructor(private readonly db: DbService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailyLapseCheck(): Promise<void> {
    try {
      const lapsed = await this.lapseExpiredMasterSubs(new Date());
      this.logger.log({
        msg: 'master_subscriptions_lapse_check_complete',
        lapsed: lapsed.length,
      });
    } catch (err) {
      this.logger.error(
        { msg: 'master_subscriptions_lapse_check_failed' },
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Find all `active` master subs whose `current_period_end` is before
   * `now`, flip them to `past_due`, and write `lapsed` audit entries.
   * Returns the affected rows for caller-side logging / tests.
   *
   * Exported as a plain method so tests can invoke it without waiting
   * for the cron schedule.
   */
  async lapseExpiredMasterSubs(now: Date): Promise<MasterSubscription[]> {
    return this.db.bypassRls(async (tx) => {
      const lapsed = await tx
        .update(masterSubscriptions)
        .set({ status: 'past_due' })
        .where(
          and(
            eq(masterSubscriptions.status, 'active'),
            lt(masterSubscriptions.currentPeriodEnd, now),
          ),
        )
        .returning();

      if (lapsed.length === 0) return lapsed;

      // Batch-insert audit entries in one round trip
      await tx.insert(masterSubscriptionAuditLog).values(
        lapsed.map((sub) => ({
          masterSubscriptionId: sub.id,
          actorUserId: null,
          action: 'lapsed' as const,
          targetMemberId: null,
          metadata: {
            previousStatus: 'active',
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          },
        })),
      );

      for (const sub of lapsed) {
        this.logger.log({
          msg: 'master_subscription_lapsed',
          masterSubscriptionId: sub.id,
          displayName: sub.displayName,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        });
      }

      return lapsed;
    });
  }
}
