import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, lt, not, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { subscriptions } from '../schema';
import {
  NON_EXPIRING_TIERS,
  SUBSCRIPTION_GRACE_PERIOD_MS,
} from './entitlements.config';

export interface ExpiredSubscription {
  id: string;
  userId: string;
  tier: string;
  currentPeriodEnd: Date;
}

@Injectable()
export class SubscriptionExpirationService {
  private readonly logger = new Logger(SubscriptionExpirationService.name);

  constructor(private readonly db: DbService) {}

  /**
   * Scheduled job that runs every hour to find and downgrade expired subscriptions.
   * Subscriptions are considered expired when:
   * - currentPeriodEnd + 24 hour grace period < now
   * - tier is not in NON_EXPIRING_TIERS (free, lifetime)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredSubscriptions(): Promise<void> {
    this.logger.log('Checking for expired subscriptions...');

    try {
      const expired = await this.findExpiredSubscriptions();

      if (expired.length === 0) {
        this.logger.log('No expired subscriptions found');
        return;
      }

      this.logger.log(`Found ${expired.length} expired subscription(s)`);

      const downgraded = await this.downgradeExpiredSubscriptions(expired);

      this.logger.log(
        `Downgraded ${downgraded.length} subscription(s) to free tier`,
      );

      // Log each downgraded subscription for audit trail
      for (const sub of downgraded) {
        this.logger.log(
          `Downgraded user ${sub.userId} from ${sub.tier} to free (expired: ${sub.currentPeriodEnd.toISOString()})`,
        );
      }

      // TODO: Emit events for email notifications
      // e.g., this.eventEmitter.emit('subscription.expired', downgraded);
    } catch (error) {
      this.logger.error('Failed to process expired subscriptions', error);
    }
  }

  /**
   * Find all subscriptions that have expired (past grace period) and are on paid tiers.
   */
  async findExpiredSubscriptions(): Promise<ExpiredSubscription[]> {
    const gracePeriodAgo = new Date(Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS);

    return this.db.bypassRls(async (tx) => {
      const expired = await tx
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          tier: subscriptions.tier,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(
          and(
            // Has an expiration date set
            sql`${subscriptions.currentPeriodEnd} IS NOT NULL`,
            // Past the grace period
            lt(subscriptions.currentPeriodEnd, gracePeriodAgo),
            // Is on a paid tier (not free or lifetime)
            not(inArray(subscriptions.tier, NON_EXPIRING_TIERS)),
            // Not already canceled
            or(
              sql`${subscriptions.status} IS NULL`,
              not(eq(subscriptions.status, 'canceled')),
            ),
          ),
        );

      return expired as ExpiredSubscription[];
    });
  }

  /**
   * Downgrade a list of expired subscriptions to the free tier.
   * Returns the list of subscriptions that were downgraded.
   */
  async downgradeExpiredSubscriptions(
    expired: ExpiredSubscription[],
  ): Promise<ExpiredSubscription[]> {
    if (expired.length === 0) {
      return [];
    }

    const ids = expired.map((sub) => sub.id);

    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ tier: 'free', status: 'canceled' })
        .where(inArray(subscriptions.id, ids));
    });

    return expired;
  }
}
