import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { ApiClsService } from 'src/lib/api-cls.service';
import { subscriptions, users } from 'src/schema';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  /** Get current user's subscription (RLS-scoped). */
  async getMySubscription() {
    return this.db.rls(async (tx) => {
      const userId = this.cls.requireUserId();
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));
      if (!sub) throw new NotFoundException('Subscription not found');
      return sub;
    });
  }

  /** Find subscription by userId (bypass RLS — for webhooks). */
  async findByUserId(userId: string) {
    return this.db.bypassRls(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));
      return sub ?? null;
    });
  }

  /** Find subscription by Stripe customer ID (bypass RLS — for webhooks). */
  async findByStripeCustomerId(stripeCustomerId: string) {
    return this.db.bypassRls(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
      return sub ?? null;
    });
  }

  /** Find subscription by Stripe subscription ID (bypass RLS — for webhooks). */
  async findByStripeSubscriptionId(stripeSubscriptionId: string) {
    return this.db.bypassRls(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
      return sub ?? null;
    });
  }

  /** Look up user email for Stripe customer creation. */
  async getUserEmail(userId: string): Promise<string | null> {
    return this.db.bypassRls(async (tx) => {
      const [user] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      return user?.email ?? null;
    });
  }

  /** Store Stripe customer ID after creating a customer. */
  async setStripeCustomerId(userId: string, stripeCustomerId: string) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ stripeCustomerId })
        .where(eq(subscriptions.userId, userId))
        .returning();
      return updated;
    });
  }

  /** Activate a subscription after checkout — set all Stripe fields + tier. */
  async activateSubscription(params: {
    userId: string;
    tier: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    currentPeriodEnd: Date;
  }) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({
          tier: params.tier,
          stripeSubscriptionId: params.stripeSubscriptionId,
          stripePriceId: params.stripePriceId,
          status: 'active',
          currentPeriodEnd: params.currentPeriodEnd,
        })
        .where(eq(subscriptions.userId, params.userId))
        .returning();
      return updated;
    });
  }

  /** Update subscription from Stripe webhook (subscription.updated). */
  async updateFromStripe(params: {
    stripeSubscriptionId: string;
    tier: string;
    stripePriceId: string;
    status: string;
    currentPeriodEnd: Date;
  }) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({
          tier: params.tier,
          stripePriceId: params.stripePriceId,
          status: params.status,
          currentPeriodEnd: params.currentPeriodEnd,
        })
        .where(
          eq(subscriptions.stripeSubscriptionId, params.stripeSubscriptionId),
        )
        .returning();
      return updated;
    });
  }

  /** Cancel subscription — downgrade to free, clear Stripe fields. */
  async cancelSubscription(stripeSubscriptionId: string) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({
          tier: 'free',
          status: 'canceled',
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodEnd: null,
        })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
        .returning();
      return updated;
    });
  }

  /** Mark subscription as past_due after payment failure. */
  async markPastDue(stripeSubscriptionId: string) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: 'past_due' })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
        .returning();
      return updated;
    });
  }
}
