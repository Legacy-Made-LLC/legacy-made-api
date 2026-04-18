import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { EntitlementsService } from 'src/entitlements/entitlements.service';
import type { SubscriptionTier } from 'src/entitlements/entitlements.types';
import { processedRevenuecatEvents, subscriptions } from 'src/schema';
import type { RcWebhookEvent } from './dto/webhook.dto';

type SubscriptionStatus = 'active' | 'in_grace_period' | 'expired';
export type EventOutcome = 'handled' | 'skipped';

@Injectable()
export class RevenuecatService {
  private readonly logger = new Logger(RevenuecatService.name);

  constructor(
    private readonly db: DbService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async isEventProcessed(eventId: string): Promise<boolean> {
    return this.db.bypassRls(async (tx) => {
      const [row] = await tx
        .select({ eventId: processedRevenuecatEvents.eventId })
        .from(processedRevenuecatEvents)
        .where(eq(processedRevenuecatEvents.eventId, eventId));
      return row !== undefined;
    });
  }

  async recordProcessedEvent(
    eventId: string,
    eventType: string,
    outcome: EventOutcome,
  ): Promise<void> {
    await this.db.bypassRls(async (tx) => {
      await tx
        .insert(processedRevenuecatEvents)
        .values({ eventId, eventType, outcome })
        .onConflictDoNothing({ target: processedRevenuecatEvents.eventId });
    });
  }

  async handleEvent(event: RcWebhookEvent): Promise<EventOutcome> {
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        await this.applyActive(event);
        return 'handled';

      case 'CANCELLATION':
        await this.applyCancellation(event);
        return 'handled';

      case 'EXPIRATION':
        await this.applyExpiration(event);
        return 'handled';

      case 'BILLING_ISSUE':
        await this.applyBillingIssue(event);
        return 'handled';

      case 'PRODUCT_CHANGE':
        await this.applyProductChange(event);
        return 'handled';

      case 'SUBSCRIPTION_PAUSED':
        // Play Store only. Treat as expired until we introduce a dedicated
        // 'paused' state; user can resume from the Play Store.
        await this.applyExpiration(event);
        return 'handled';

      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIBER_ALIAS':
      case 'TRANSFER':
      case 'TEST':
        return 'skipped';
    }
  }

  private async applyActive(event: RcWebhookEvent): Promise<void> {
    const tier = this.resolveTier(event);
    if (!tier) {
      this.logger.warn({
        msg: 'revenuecat_unmapped_entitlement',
        eventId: event.id,
        appUserId: event.app_user_id,
        entitlementIds: event.entitlement_ids,
      });
      return;
    }

    await this.entitlements.updateTier(event.app_user_id, tier);
    await this.writeSubscription(event, {
      status: 'active',
      tier,
      unsubscribeDetectedAt: null,
    });
  }

  private async applyCancellation(event: RcWebhookEvent): Promise<void> {
    // The user cancelled; access continues until expiration_at_ms. Record
    // the unsubscribe timestamp so UI can surface "cancellation pending"
    // without changing tier/status.
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ unsubscribeDetectedAt: new Date() })
        .where(eq(subscriptions.userId, event.app_user_id));
    });
  }

  private async applyExpiration(event: RcWebhookEvent): Promise<void> {
    await this.entitlements.updateTier(event.app_user_id, 'free');
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          status: 'expired',
          rcOriginalTransactionId: null,
          rcProductId: null,
          rcStore: null,
          unsubscribeDetectedAt: null,
          currentPeriodEnd: null,
        })
        .where(eq(subscriptions.userId, event.app_user_id));
    });
  }

  private async applyBillingIssue(event: RcWebhookEvent): Promise<void> {
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          status: 'in_grace_period',
          currentPeriodEnd: event.grace_period_expiration_at_ms
            ? new Date(event.grace_period_expiration_at_ms)
            : null,
        })
        .where(eq(subscriptions.userId, event.app_user_id));
    });
  }

  private async applyProductChange(event: RcWebhookEvent): Promise<void> {
    const tier = this.resolveTier(event);
    if (!tier) return;

    await this.entitlements.updateTier(event.app_user_id, tier);
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          tier,
          rcProductId: event.new_product_id ?? event.product_id ?? null,
        })
        .where(eq(subscriptions.userId, event.app_user_id));
    });
  }

  private async writeSubscription(
    event: RcWebhookEvent,
    fields: {
      status: SubscriptionStatus;
      tier: SubscriptionTier;
      unsubscribeDetectedAt: Date | null;
    },
  ): Promise<void> {
    await this.db.bypassRls(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          status: fields.status,
          tier: fields.tier,
          rcOriginalTransactionId: event.original_transaction_id ?? null,
          rcProductId: event.product_id ?? null,
          rcStore: event.store ?? null,
          currentPeriodEnd: event.expiration_at_ms
            ? new Date(event.expiration_at_ms)
            : null,
          unsubscribeDetectedAt: fields.unsubscribeDetectedAt,
        })
        .where(eq(subscriptions.userId, event.app_user_id));
    });
  }

  // MVP convention: RC entitlement IDs match our tier names. When the
  // convention diverges (e.g. localized entitlement names, A/B-tested
  // product lines), replace this with a config-driven map.
  private resolveTier(
    event: RcWebhookEvent,
  ): Extract<SubscriptionTier, 'individual' | 'family'> | null {
    const ids =
      event.entitlement_ids ??
      (event.entitlement_id ? [event.entitlement_id] : []);
    if (ids.includes('individual')) return 'individual';
    if (ids.includes('family')) return 'family';
    return null;
  }
}
