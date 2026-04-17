import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ApiConfigService } from 'src/config/api-config.service';
import { SubscriptionTier } from 'src/entitlements/entitlements.types';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly priceToTier: Map<string, SubscriptionTier>;
  private readonly tierToPrice: Map<SubscriptionTier, string>;

  constructor(private readonly config: ApiConfigService) {
    // Pinned intentionally. Bump alongside SDK upgrades — Stripe API changes can silently alter handler behavior.
    this.stripe = new Stripe(this.config.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-02-25.clover',
    });
    this.webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');

    const individualPriceId = this.config.get('STRIPE_PRICE_ID_INDIVIDUAL');
    const familyPriceId = this.config.get('STRIPE_PRICE_ID_FAMILY');

    this.priceToTier = new Map<string, SubscriptionTier>([
      [individualPriceId, 'individual'],
      [familyPriceId, 'family'],
    ]);

    this.tierToPrice = new Map<SubscriptionTier, string>([
      ['individual', individualPriceId],
      ['family', familyPriceId],
    ]);
  }

  async createCustomer(
    email: string,
    userId: string,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      metadata: { userId },
    });
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  async retrieveSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  getTierForPriceId(priceId: string): SubscriptionTier | undefined {
    return this.priceToTier.get(priceId);
  }

  getPriceIdForTier(tier: SubscriptionTier): string | undefined {
    return this.tierToPrice.get(tier);
  }
}
