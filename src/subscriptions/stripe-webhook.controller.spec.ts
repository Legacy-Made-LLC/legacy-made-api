import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { StripeService } from 'src/stripe/stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeService: { constructWebhookEvent: jest.Mock };
  let subscriptionsService: {
    findByStripeCustomerId: jest.Mock;
    activateSubscription: jest.Mock;
    updateFromStripe: jest.Mock;
    cancelSubscription: jest.Mock;
    markPastDue: jest.Mock;
    isEventProcessed: jest.Mock;
    recordProcessedEvent: jest.Mock;
  };

  beforeEach(async () => {
    stripeService = {
      constructWebhookEvent: jest.fn(),
    };
    subscriptionsService = {
      findByStripeCustomerId: jest.fn(),
      activateSubscription: jest.fn(),
      updateFromStripe: jest.fn(),
      cancelSubscription: jest.fn(),
      markPastDue: jest.fn(),
      isEventProcessed: jest.fn(),
      recordProcessedEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: StripeService,
          useValue: {
            ...stripeService,
            retrieveSubscription: jest.fn(),
            getTierForPriceId: jest.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: subscriptionsService,
        },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('idempotency', () => {
    it('short-circuits replayed events without running handlers or re-recording', async () => {
      const replayedEvent = {
        id: 'evt_replayed_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_abc',
            status: 'active',
            items: { data: [] },
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(replayedEvent);
      subscriptionsService.isEventProcessed.mockResolvedValue(true);

      const rawBody = Buffer.from('{}');
      const result = await controller.handleWebhook(rawBody, 'sig_123');

      // Dedupe short-circuits before any handler logic.
      expect(subscriptionsService.isEventProcessed).toHaveBeenCalledWith(
        'evt_replayed_123',
      );
      expect(subscriptionsService.updateFromStripe).not.toHaveBeenCalled();
      expect(subscriptionsService.activateSubscription).not.toHaveBeenCalled();
      expect(subscriptionsService.cancelSubscription).not.toHaveBeenCalled();
      expect(subscriptionsService.markPastDue).not.toHaveBeenCalled();
      // Already-processed row: no re-insert.
      expect(subscriptionsService.recordProcessedEvent).not.toHaveBeenCalled();
      // Response flags the dedupe path so callers / logs can distinguish.
      expect(result).toEqual({ received: true, deduped: true });
    });
  });
});
