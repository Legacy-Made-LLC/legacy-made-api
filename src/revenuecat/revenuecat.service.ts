import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { ApiConfigService } from 'src/config/api-config.service';
import { DbService, type DrizzleTransaction } from 'src/db/db.service';
import type { SubscriptionTier } from 'src/entitlements/entitlements.types';
import { processedRevenuecatEvents, subscriptions } from 'src/schema';
import type { RcWebhookEvent } from './dto/webhook.dto';

type SubscriptionStatus = 'active' | 'in_grace_period' | 'expired';
export type EventOutcome = 'handled' | 'skipped';

export interface ReconcileResult {
  tier: SubscriptionTier;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancellationPending: boolean;
}

interface RcSubscriberSubscription {
  expires_date: string | null;
  store?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  original_purchase_date?: string | null;
}

interface RcSubscriberEntitlement {
  expires_date: string | null;
  product_identifier?: string;
}

interface RcSubscriberPayload {
  subscriber: {
    original_app_user_id: string;
    entitlements: Record<string, RcSubscriberEntitlement>;
    subscriptions?: Record<string, RcSubscriberSubscription>;
  };
}

@Injectable()
export class RevenuecatService {
  private readonly logger = new Logger(RevenuecatService.name);
  private readonly entitlementIndividual: string;
  private readonly entitlementFamily: string;
  private readonly restApiKey: string;
  private readonly restBaseUrl: string;

  constructor(
    private readonly db: DbService,
    private readonly config: ApiConfigService,
  ) {
    this.entitlementIndividual = this.config.get(
      'RC_ENTITLEMENT_ID_INDIVIDUAL',
    );
    this.entitlementFamily = this.config.get('RC_ENTITLEMENT_ID_FAMILY');
    this.restApiKey = this.config.get('REVENUECAT_REST_API_KEY');
    this.restBaseUrl = this.config.get('REVENUECAT_API_BASE_URL');
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    return this.db.bypassRls(async (tx) => {
      const [row] = await tx
        .select({ eventId: processedRevenuecatEvents.eventId })
        .from(processedRevenuecatEvents)
        .where(eq(processedRevenuecatEvents.eventId, eventId));
      return row !== undefined;
    });
  }

  /**
   * Apply an RC webhook event and record its processing in a single
   * transaction. Either both the subscription mutation and the dedupe
   * row commit, or neither does — so a retry after a partial failure
   * replays the whole event cleanly instead of being swallowed by the
   * dedupe table.
   *
   * Idempotent by design: SET statements use deterministic values from
   * the event payload, and the dedupe insert uses ON CONFLICT DO NOTHING.
   */
  async processEvent(event: RcWebhookEvent): Promise<EventOutcome> {
    return this.db.bypassRls(async (tx) => {
      const outcome = await this.dispatch(tx, event);
      await tx
        .insert(processedRevenuecatEvents)
        .values({
          eventId: event.id,
          eventType: event.type,
          outcome,
        })
        .onConflictDoNothing({ target: processedRevenuecatEvents.eventId });
      return outcome;
    });
  }

  private async dispatch(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<EventOutcome> {
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        await this.applyActive(tx, event);
        return 'handled';

      case 'CANCELLATION':
        await this.applyCancellation(tx, event);
        return 'handled';

      case 'EXPIRATION':
        await this.applyExpiration(tx, event);
        return 'handled';

      case 'BILLING_ISSUE':
        await this.applyBillingIssue(tx, event);
        return 'handled';

      case 'PRODUCT_CHANGE':
        await this.applyProductChange(tx, event);
        return 'handled';

      case 'SUBSCRIPTION_PAUSED':
        // Play Store only. Treat as expired until we introduce a dedicated
        // 'paused' state; user can resume from the Play Store.
        await this.applyExpiration(tx, event);
        return 'handled';

      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIBER_ALIAS':
      case 'TRANSFER':
      case 'TEST':
      default:
        // Unknown types land here too; the controller logs 'skipped' at
        // warn level so new RC event types are visible without 5xx'ing.
        return 'skipped';
    }
  }

  // Lifetime is manually granted and must never be downgraded or mutated by
  // RC webhooks. Every subscription-mutation query narrows by tier != 'lifetime'
  // so a stray RC event for a lifetime user can't alter their access.
  private notLifetime(userId: string) {
    return and(
      eq(subscriptions.userId, userId),
      ne(subscriptions.tier, 'lifetime'),
    );
  }

  // RC's app_user_id may not match a user row when webhooks land before the
  // client calls Purchases.logIn (anonymous $RCAnonymousID:* IDs) or when a
  // lifetime user's row is filtered out by notLifetime. Emit a warn so those
  // orphans are visible instead of silent no-ops.
  private logIfUnmatched(
    result: { userId: string }[],
    event: RcWebhookEvent,
  ): void {
    if (result.length === 0) {
      this.logger.warn({
        msg: 'revenuecat_unmatched_user',
        eventId: event.id,
        eventType: event.type,
        appUserId: event.app_user_id,
      });
    }
  }

  private async applyActive(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<void> {
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

    await this.writeSubscription(tx, event, {
      status: 'active',
      tier,
      unsubscribeDetectedAt: null,
    });
  }

  private async applyCancellation(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<void> {
    // The user cancelled; access continues until expiration_at_ms. Record
    // the unsubscribe timestamp so UI can surface "cancellation pending"
    // without changing tier/status.
    const result = await tx
      .update(subscriptions)
      .set({ unsubscribeDetectedAt: new Date() })
      .where(this.notLifetime(event.app_user_id))
      .returning({ userId: subscriptions.userId });
    this.logIfUnmatched(result, event);
  }

  private async applyExpiration(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<void> {
    const result = await tx
      .update(subscriptions)
      .set({
        tier: 'free',
        status: 'expired',
        rcOriginalTransactionId: null,
        rcProductId: null,
        rcStore: null,
        unsubscribeDetectedAt: null,
        currentPeriodEnd: null,
      })
      .where(this.notLifetime(event.app_user_id))
      .returning({ userId: subscriptions.userId });
    this.logIfUnmatched(result, event);
  }

  private async applyBillingIssue(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<void> {
    const result = await tx
      .update(subscriptions)
      .set({
        status: 'in_grace_period',
        currentPeriodEnd: event.grace_period_expiration_at_ms
          ? new Date(event.grace_period_expiration_at_ms)
          : null,
      })
      .where(this.notLifetime(event.app_user_id))
      .returning({ userId: subscriptions.userId });
    this.logIfUnmatched(result, event);
  }

  private async applyProductChange(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<void> {
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

    const result = await tx
      .update(subscriptions)
      .set({
        tier,
        rcProductId: event.new_product_id ?? event.product_id ?? null,
      })
      .where(this.notLifetime(event.app_user_id))
      .returning({ userId: subscriptions.userId });
    this.logIfUnmatched(result, event);
  }

  private async writeSubscription(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
    fields: {
      status: SubscriptionStatus;
      tier: SubscriptionTier;
      unsubscribeDetectedAt: Date | null;
    },
  ): Promise<void> {
    const result = await tx
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
      .where(this.notLifetime(event.app_user_id))
      .returning({ userId: subscriptions.userId });
    this.logIfUnmatched(result, event);
  }

  // Map RC entitlement identifiers (configured in the dashboard) to our
  // internal tier names. Identifiers come from RC_ENTITLEMENT_ID_*
  // env vars; defaults are 'individual' and 'family'.
  private resolveTier(
    event: RcWebhookEvent,
  ): Extract<SubscriptionTier, 'individual' | 'family'> | null {
    const ids =
      event.entitlement_ids ??
      (event.entitlement_id ? [event.entitlement_id] : []);
    if (ids.includes(this.entitlementIndividual)) return 'individual';
    if (ids.includes(this.entitlementFamily)) return 'family';
    return null;
  }

  /**
   * Force-sync the user's subscription row against RC's REST API view of
   * the subscriber. Used for self-healing reconciliation when our DB has
   * diverged from RC — e.g. a webhook delivery that never landed, or
   * (in dev) a manual DB edit. Webhooks remain the primary path; this
   * is the safety net the FE can call from Restore Purchases or the
   * activating screen's "force refresh" path.
   *
   * No-ops for lifetime users — their tier is granted manually and must
   * never be downgraded by an RC view that doesn't know about it.
   */
  async reconcileFromRc(userId: string): Promise<ReconcileResult> {
    const payload = await this.fetchSubscriber(userId);
    const desired = this.deriveDesiredState(payload);

    return this.db.bypassRls(async (tx) => {
      const [existing] = await tx
        .select({
          tier: subscriptions.tier,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          unsubscribeDetectedAt: subscriptions.unsubscribeDetectedAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));

      // Lifetime users: don't touch the row, just report current state.
      if (existing?.tier === 'lifetime') {
        return {
          tier: 'lifetime',
          status: existing.status as SubscriptionStatus | null,
          currentPeriodEnd: existing.currentPeriodEnd,
          cancellationPending: existing.unsubscribeDetectedAt !== null,
        };
      }

      const result = await tx
        .update(subscriptions)
        .set({
          tier: desired.tier,
          status: desired.status,
          rcOriginalTransactionId: desired.rcOriginalTransactionId,
          rcProductId: desired.rcProductId,
          rcStore: desired.rcStore,
          currentPeriodEnd: desired.currentPeriodEnd,
          unsubscribeDetectedAt: desired.unsubscribeDetectedAt,
        })
        .where(this.notLifetime(userId))
        .returning({ userId: subscriptions.userId });

      if (result.length === 0) {
        // No row exists for this user. The user-bootstrap flow (sign-up)
        // is responsible for creating the free-tier row; we don't insert
        // here so reconcile stays a pure "align with RC" operation.
        this.logger.warn({
          msg: 'revenuecat_reconcile_no_row',
          userId,
        });
      }

      return {
        tier: desired.tier,
        status: desired.status,
        currentPeriodEnd: desired.currentPeriodEnd,
        cancellationPending: desired.unsubscribeDetectedAt !== null,
      };
    });
  }

  private async fetchSubscriber(userId: string): Promise<RcSubscriberPayload> {
    const url = `${this.restBaseUrl}/subscribers/${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.restApiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `RevenueCat REST ${res.status} for subscriber ${userId}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as RcSubscriberPayload;
  }

  // Translate the RC subscriber payload into the row state we'd write.
  // Mirrors the webhook handlers' logic: an active entitlement maps to
  // the corresponding tier; otherwise we revert to free/expired.
  private deriveDesiredState(payload: RcSubscriberPayload): {
    tier: SubscriptionTier;
    status: SubscriptionStatus | null;
    rcOriginalTransactionId: string | null;
    rcProductId: string | null;
    rcStore: string | null;
    currentPeriodEnd: Date | null;
    unsubscribeDetectedAt: Date | null;
  } {
    const now = Date.now();
    const subscriber = payload.subscriber;
    const ents = subscriber.entitlements ?? {};

    const isActive = (e: RcSubscriberEntitlement | undefined) =>
      !!e &&
      (e.expires_date === null ||
        (e.expires_date !== undefined &&
          new Date(e.expires_date).getTime() > now));

    let tier: Extract<SubscriptionTier, 'individual' | 'family'> | null = null;
    let entitlement: RcSubscriberEntitlement | undefined;
    if (isActive(ents[this.entitlementIndividual])) {
      tier = 'individual';
      entitlement = ents[this.entitlementIndividual];
    } else if (isActive(ents[this.entitlementFamily])) {
      tier = 'family';
      entitlement = ents[this.entitlementFamily];
    }

    if (!tier || !entitlement) {
      return {
        tier: 'free',
        status: 'expired',
        rcOriginalTransactionId: null,
        rcProductId: null,
        rcStore: null,
        currentPeriodEnd: null,
        unsubscribeDetectedAt: null,
      };
    }

    const productId = entitlement.product_identifier ?? null;
    const sub = productId ? subscriber.subscriptions?.[productId] : undefined;

    const status: SubscriptionStatus = sub?.billing_issues_detected_at
      ? 'in_grace_period'
      : 'active';

    return {
      tier,
      status,
      rcOriginalTransactionId: null, // not surfaced on the subscriber endpoint
      rcProductId: productId,
      rcStore: sub?.store ?? null,
      currentPeriodEnd: entitlement.expires_date
        ? new Date(entitlement.expires_date)
        : null,
      unsubscribeDetectedAt: sub?.unsubscribe_detected_at
        ? new Date(sub.unsubscribe_detected_at)
        : null,
    };
  }
}
