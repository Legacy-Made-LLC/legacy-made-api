import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { ApiConfigService } from 'src/config/api-config.service';
import { DbService, type DrizzleTransaction } from 'src/db/db.service';
import type { SubscriptionTier } from 'src/entitlements/entitlements.types';
import { processedRevenuecatEvents, subscriptions } from 'src/schema';
import type { RcWebhookEvent } from './dto/webhook.dto';

type SubscriptionStatus = 'active' | 'in_grace_period' | 'expired';
export type EventOutcome = 'handled' | 'skipped';

// Events that don't carry enough payload to update inline but signal
// state divergence (user-id aliasing, cross-store transfer). After the
// dedupe tx commits we reconcile against RC's REST view to catch up —
// see processEvent().
const RECONCILE_AFTER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'SUBSCRIBER_ALIAS',
  'TRANSFER',
]);

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
   *
   * Some event types (TRANSFER, SUBSCRIBER_ALIAS) signal that our row
   * may have diverged from RC's view but don't carry enough payload to
   * fix it inline. For those we run reconcileFromRc after the dedupe
   * tx commits — best-effort, since RC won't redeliver the event once
   * dedupe is recorded. A reconcile failure is logged for follow-up.
   */
  async processEvent(event: RcWebhookEvent): Promise<EventOutcome> {
    const outcome = await this.db.bypassRls(async (tx) => {
      const o = await this.dispatch(tx, event);
      await tx
        .insert(processedRevenuecatEvents)
        .values({
          eventId: event.id,
          eventType: event.type,
          outcome: o,
        })
        .onConflictDoNothing({ target: processedRevenuecatEvents.eventId });
      return o;
    });

    if (RECONCILE_AFTER_EVENT_TYPES.has(event.type)) {
      try {
        await this.reconcileFromRc(event.app_user_id);
      } catch (err) {
        // Non-fatal: dedupe is already committed, so RC won't retry.
        // Surface loudly so we can replay manually if needed.
        this.logger.error(
          {
            msg: 'revenuecat_post_event_reconcile_failed',
            eventId: event.id,
            eventType: event.type,
            appUserId: event.app_user_id,
          },
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    return outcome;
  }

  private async dispatch(
    tx: DrizzleTransaction,
    event: RcWebhookEvent,
  ): Promise<EventOutcome> {
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'REFUND_REVERSED':
        // REFUND_REVERSED: a prior refund was reversed — re-entitle using
        // the event's current product/entitlement payload. Same shape as
        // RENEWAL for our purposes.
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

      case 'SUBSCRIBER_ALIAS':
      case 'TRANSFER':
        // Don't mutate here — payload is thin. processEvent() runs a
        // reconcile against RC's REST view after the dedupe tx commits
        // so any prior orphan rows (e.g., an INITIAL_PURCHASE delivered
        // under $RCAnonymousID before logIn) get caught up.
        return 'handled';

      case 'NON_RENEWING_PURCHASE':
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
    // Defense-in-depth: `notLifetime()` in the WHERE already filters
    // lifetime rows, but expiration is the only handler that downgrades
    // a tier, so we explicitly assert the invariant here too. If this
    // ever logs, something is calling applyExpiration for a lifetime
    // user and we want that visible, not silently filtered.
    const [existing] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.userId, event.app_user_id));
    if (existing?.tier === 'lifetime') {
      this.logger.warn({
        msg: 'revenuecat_expiration_skipped_lifetime',
        eventId: event.id,
        appUserId: event.app_user_id,
      });
      return;
    }

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
   *
   * Field semantics: only fields RC's subscriber endpoint actually
   * authoritatively reports for this user are written. We never null out
   * a webhook-set value (notably `rcOriginalTransactionId`, which the
   * subscriber endpoint omits) — those fields are left untouched so the
   * webhook-anchored row identity survives a reconcile.
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
      // The notLifetime() guard on the UPDATE below covers a row flipping
      // to lifetime mid-transaction; this short-circuit avoids an unneeded
      // write attempt for the common case.
      if (existing?.tier === 'lifetime') {
        return {
          tier: 'lifetime',
          status: existing.status as SubscriptionStatus | null,
          currentPeriodEnd: existing.currentPeriodEnd,
          cancellationPending: existing.unsubscribeDetectedAt !== null,
        };
      }

      // Build the SET payload by including only fields the RC payload
      // gave us authoritative values for. Drizzle-set-with-undefined
      // would still write a column, so we strip undefined first.
      const setPayload: Record<string, unknown> = {
        tier: desired.tier,
        status: desired.status,
        currentPeriodEnd: desired.currentPeriodEnd,
      };
      if (desired.rcProductId !== undefined) {
        setPayload.rcProductId = desired.rcProductId;
      }
      if (desired.rcStore !== undefined) {
        setPayload.rcStore = desired.rcStore;
      }
      if (desired.unsubscribeDetectedAt !== undefined) {
        setPayload.unsubscribeDetectedAt = desired.unsubscribeDetectedAt;
      }

      const result = await tx
        .update(subscriptions)
        .set(setPayload)
        .where(this.notLifetime(userId))
        .returning({ userId: subscriptions.userId });

      if (result.length === 0) {
        // No row exists for this user. The user-bootstrap flow (sign-up)
        // is responsible for creating the free-tier row; we don't insert
        // here so reconcile stays a pure "align with RC" operation.
        this.logger.warn({
          msg: 'revenuecat_reconcile_no_row',
          userId,
          desiredTier: desired.tier,
        });
      }

      return {
        tier: desired.tier,
        status: desired.status,
        currentPeriodEnd: desired.currentPeriodEnd,
        // Report the existing flag if RC didn't give us a fresh value,
        // so callers don't observe a transient "cancellation cleared".
        cancellationPending:
          desired.unsubscribeDetectedAt !== undefined
            ? desired.unsubscribeDetectedAt !== null
            : existing?.unsubscribeDetectedAt !== null &&
              existing?.unsubscribeDetectedAt !== undefined,
      };
    });
  }

  private async fetchSubscriber(userId: string): Promise<RcSubscriberPayload> {
    const url = `${this.restBaseUrl}/subscribers/${encodeURIComponent(userId)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.restApiKey}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      // Network failure (DNS, TCP). Treat as a transient upstream issue.
      throw new BadGatewayException(
        `RevenueCat REST request failed: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // RC's GET /v1/subscribers/{id} auto-creates the customer if
      // unknown, so non-2xx here means upstream config (bad key) or RC
      // outage — not "user doesn't exist". Map to 502 so the FE can
      // distinguish from a real 4xx on /entitlements/sync itself.
      this.logger.error({
        msg: 'revenuecat_reconcile_upstream_failure',
        status: res.status,
        body: body.slice(0, 200),
      });
      throw new BadGatewayException(
        `RevenueCat REST ${res.status}: ${body.slice(0, 120)}`,
      );
    }
    return (await res.json()) as RcSubscriberPayload;
  }

  // Translate the RC subscriber payload into the row state we'd write.
  // Mirrors the webhook handlers' logic: an active entitlement maps to
  // the corresponding tier; otherwise we revert to free/expired.
  //
  // A field returned as `undefined` means "RC didn't give us a value
  // here — preserve the existing row value." A field returned as `null`
  // means "RC explicitly told us this is empty — write the null."
  private deriveDesiredState(payload: RcSubscriberPayload): {
    tier: SubscriptionTier;
    status: SubscriptionStatus | null;
    rcProductId: string | null | undefined;
    rcStore: string | null | undefined;
    currentPeriodEnd: Date | null;
    unsubscribeDetectedAt: Date | null | undefined;
  } {
    const now = Date.now();
    const subscriber = payload.subscriber;
    const ents = subscriber.entitlements ?? {};

    // RC convention: a non-subscription entitlement (e.g. a lifetime
    // grant via promo) reports `expires_date === null`. We don't issue
    // those for paid tiers, so treat null as "no expiration recorded"
    // and accept it as active — same as the SDK's CustomerInfo logic.
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
      // No active entitlement: align with the EXPIRATION webhook handler.
      // Explicit nulls so any leftover store/product/cancellation flags
      // from a prior period are cleared.
      return {
        tier: 'free',
        status: 'expired',
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

    // If we found a matching subscription block, RC's view of this
    // product is authoritative — write its store/cancellation fields,
    // including explicit null when RC reports it. If the entitlement
    // came from a promo/grant with no subscription block, leave those
    // fields untouched (undefined) so a webhook-set value survives.
    return {
      tier,
      status,
      rcProductId: productId,
      // `undefined` (preserve existing) when RC didn't return a
      // subscription block for this product — common for promotional
      // grants; otherwise RC's value (including explicit null).
      rcStore: sub === undefined ? undefined : (sub.store ?? null),
      currentPeriodEnd: entitlement.expires_date
        ? new Date(entitlement.expires_date)
        : null,
      unsubscribeDetectedAt:
        sub === undefined
          ? undefined
          : sub.unsubscribe_detected_at
            ? new Date(sub.unsubscribe_detected_at)
            : null,
    };
  }
}
