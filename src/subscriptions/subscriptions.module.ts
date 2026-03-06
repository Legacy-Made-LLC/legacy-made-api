import { Module } from '@nestjs/common';
import { StripeModule } from 'src/stripe/stripe.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [StripeModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController, StripeWebhookController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
