import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { StripeService } from 'src/stripe/stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeService: {
    constructWebhookEvent: jest.Mock;
    retrieveSubscription: jest.Mock;
    getTierForPriceId: jest.Mock;
  };
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
      retrieveSubscription: jest.fn(),
      getTierForPriceId: jest.fn(),
    };
    subscriptionsService = {
      findByStripeCustomerId: jest.fn(),
      activateSubscription: jest.fn(),
      updateFromStripe: jest.fn(),
      cancelSubscription: jest.fn(),
      markPastDue: jest.fn(),
      isEventProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: StripeService,
          useValue: stripeService,
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

  describe('when the signature fails verification', () => {
    it('throws BadRequestException with the expected message', async () => {
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const rawBody = Buffer.from('{}');

      await expect(
        controller.handleWebhook(rawBody, 'bad_sig'),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'Invalid webhook signature',
      });

      expect(subscriptionsService.isEventProcessed).not.toHaveBeenCalled();
      expect(subscriptionsService.recordProcessedEvent).not.toHaveBeenCalled();
    });
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

  describe('when the event type is not handled', () => {
    it('records the event as skipped and returns { received: true }', async () => {
      const unknownEvent = {
        id: 'evt_unknown_1',
        type: 'unknown.event',
        data: { object: {} },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(unknownEvent);

      const result = await controller.handleWebhook(
        Buffer.from('{}'),
        'sig_ok',
      );

      expect(result).toEqual({ received: true });
      expect(subscriptionsService.recordProcessedEvent).toHaveBeenCalledWith(
        'evt_unknown_1',
        'unknown.event',
        'skipped',
      );
      // None of the concrete handler methods should have fired.
      expect(subscriptionsService.activateSubscription).not.toHaveBeenCalled();
      expect(subscriptionsService.updateFromStripe).not.toHaveBeenCalled();
      expect(subscriptionsService.cancelSubscription).not.toHaveBeenCalled();
      expect(subscriptionsService.markPastDue).not.toHaveBeenCalled();
    });
  });

  describe('checkout.session.completed', () => {
    it('activates the subscription and records the event as handled', async () => {
      const event = {
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            subscription: 'sub_checkout_1',
            customer: 'cus_checkout_1',
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(event);
      stripeService.retrieveSubscription.mockResolvedValue({
        id: 'sub_checkout_1',
        items: {
          data: [
            {
              price: { id: 'price_individual_test' },
              current_period_end: 1_800_000_000,
            },
          ],
        },
      });
      stripeService.getTierForPriceId.mockReturnValue('individual');
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        userId: 'user_abc',
      });

      const result = await controller.handleWebhook(
        Buffer.from('{}'),
        'sig_ok',
      );

      expect(subscriptionsService.activateSubscription).toHaveBeenCalledTimes(
        1,
      );
      expect(subscriptionsService.activateSubscription).toHaveBeenCalledWith({
        userId: 'user_abc',
        tier: 'individual',
        stripeSubscriptionId: 'sub_checkout_1',
        stripePriceId: 'price_individual_test',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      });
      expect(subscriptionsService.recordProcessedEvent).toHaveBeenCalledWith(
        'evt_checkout_1',
        'checkout.session.completed',
        'handled',
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('customer.subscription.updated', () => {
    it('forwards to updateFromStripe and records handled', async () => {
      const event = {
        id: 'evt_sub_updated_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_update_1',
            status: 'active',
            items: {
              data: [
                {
                  price: { id: 'price_family_test' },
                  current_period_end: 1_900_000_000,
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(event);
      stripeService.getTierForPriceId.mockReturnValue('family');

      await controller.handleWebhook(Buffer.from('{}'), 'sig_ok');

      expect(subscriptionsService.updateFromStripe).toHaveBeenCalledTimes(1);
      expect(subscriptionsService.updateFromStripe).toHaveBeenCalledWith({
        stripeSubscriptionId: 'sub_update_1',
        tier: 'family',
        stripePriceId: 'price_family_test',
        status: 'active',
        currentPeriodEnd: new Date(1_900_000_000 * 1000),
      });
      expect(subscriptionsService.recordProcessedEvent).toHaveBeenCalledWith(
        'evt_sub_updated_1',
        'customer.subscription.updated',
        'handled',
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('forwards to cancelSubscription and records handled', async () => {
      const event = {
        id: 'evt_sub_deleted_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_deleted_1',
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(event);

      await controller.handleWebhook(Buffer.from('{}'), 'sig_ok');

      expect(subscriptionsService.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(subscriptionsService.cancelSubscription).toHaveBeenCalledWith(
        'sub_deleted_1',
      );
      expect(subscriptionsService.recordProcessedEvent).toHaveBeenCalledWith(
        'evt_sub_deleted_1',
        'customer.subscription.deleted',
        'handled',
      );
    });
  });

  describe('invoice.payment_failed', () => {
    it('forwards to markPastDue and records handled', async () => {
      const event = {
        id: 'evt_payment_failed_1',
        type: 'invoice.payment_failed',
        data: {
          object: {
            parent: {
              type: 'subscription_details',
              subscription_details: {
                subscription: 'sub_past_due_1',
              },
            },
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(event);

      await controller.handleWebhook(Buffer.from('{}'), 'sig_ok');

      expect(subscriptionsService.markPastDue).toHaveBeenCalledTimes(1);
      expect(subscriptionsService.markPastDue).toHaveBeenCalledWith(
        'sub_past_due_1',
      );
      expect(subscriptionsService.recordProcessedEvent).toHaveBeenCalledWith(
        'evt_payment_failed_1',
        'invoice.payment_failed',
        'handled',
      );
    });
  });

  describe('when a handler throws', () => {
    it('propagates the error and does NOT record the event as processed', async () => {
      const event = {
        id: 'evt_handler_error_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_err_1',
          },
        },
      } as unknown as Stripe.Event;

      stripeService.constructWebhookEvent.mockReturnValue(event);
      subscriptionsService.cancelSubscription.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        controller.handleWebhook(Buffer.from('{}'), 'sig_ok'),
      ).rejects.toThrow('db down');

      // Critical: on failure Stripe must retry, so we must NOT have written
      // the idempotency row.
      expect(subscriptionsService.recordProcessedEvent).not.toHaveBeenCalled();
    });
  });
});
