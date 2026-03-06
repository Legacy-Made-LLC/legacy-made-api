import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiClsService } from 'src/lib/api-cls.service';
import { ApiConfigService } from 'src/config/api-config.service';
import { StripeService } from 'src/stripe/stripe.service';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
    private readonly cls: ApiClsService,
    private readonly config: ApiConfigService,
  ) {}

  @Get('me')
  getMySubscription() {
    return this.subscriptionsService.getMySubscription();
  }

  @Post('checkout')
  async createCheckout(@Body() dto: CreateCheckoutDto) {
    const userId = this.cls.requireUserId();
    const sub = await this.subscriptionsService.findByUserId(userId);
    if (!sub) throw new BadRequestException('No subscription record found');

    // Resolve Stripe price ID from tier
    const priceId = this.stripeService.getPriceIdForTier(dto.tier);
    if (!priceId) throw new BadRequestException('Invalid tier');

    // Ensure user has a Stripe customer
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const email = await this.subscriptionsService.getUserEmail(userId);
      if (!email) throw new BadRequestException('User email not found');

      const customer = await this.stripeService.createCustomer(email, userId);
      customerId = customer.id;
      await this.subscriptionsService.setStripeCustomerId(userId, customerId);
    }

    const baseUrl = this.config.get('APP_BASE_URL');
    const session = await this.stripeService.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${baseUrl}/settings/billing?success=true`,
      cancelUrl: `${baseUrl}/settings/billing?canceled=true`,
    });

    return { url: session.url };
  }

  @Post('portal')
  async createPortalSession() {
    const userId = this.cls.requireUserId();
    const sub = await this.subscriptionsService.findByUserId(userId);
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const baseUrl = this.config.get('APP_BASE_URL');
    const session = await this.stripeService.createPortalSession(
      sub.stripeCustomerId,
      `${baseUrl}/settings/billing`,
    );

    return { url: session.url };
  }
}
