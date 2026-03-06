import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBody,
} from '@nestjs/common';
import Stripe from 'stripe';
import { BypassJwtAuth } from 'src/auth/auth.guard';
import { StripeService } from 'src/stripe/stripe.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @BypassJwtAuth()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Received Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (
      session.mode !== 'subscription' ||
      !session.subscription ||
      !session.customer
    ) {
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const subscription =
      await this.stripeService.retrieveSubscription(stripeSubscriptionId);
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      this.logger.error('No price ID found in subscription');
      return;
    }

    const tier = this.stripeService.getTierForPriceId(priceId);
    if (!tier) {
      this.logger.error(`Unknown price ID: ${priceId}`);
      return;
    }

    // Find user by Stripe customer ID
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer.id;

    // Look up customer metadata for userId
    const sub = await this.findSubscriptionByCustomerId(customerId);
    if (!sub) {
      this.logger.error(`No subscription found for customer ${customerId}`);
      return;
    }

    await this.subscriptionsService.activateSubscription({
      userId: sub.userId,
      tier,
      stripeSubscriptionId,
      stripePriceId: priceId,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    this.logger.log(`Activated ${tier} subscription for user ${sub.userId}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) return;

    const tier = this.stripeService.getTierForPriceId(priceId);
    if (!tier) {
      this.logger.error(`Unknown price ID on update: ${priceId}`);
      return;
    }

    await this.subscriptionsService.updateFromStripe({
      stripeSubscriptionId: subscription.id,
      tier,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    this.logger.log(
      `Updated subscription ${subscription.id} to ${tier}/${subscription.status}`,
    );
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    await this.subscriptionsService.cancelSubscription(subscription.id);
    this.logger.log(`Canceled subscription ${subscription.id}`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;

    if (!subscriptionId) return;

    await this.subscriptionsService.markPastDue(subscriptionId);
    this.logger.log(`Marked subscription ${subscriptionId} as past_due`);
  }

  /** Find our subscription record by Stripe customer ID. */
  private async findSubscriptionByCustomerId(customerId: string) {
    // We store stripeCustomerId on the subscription record
    return this.subscriptionsService.findByStripeCustomerId(customerId);
  }
}
