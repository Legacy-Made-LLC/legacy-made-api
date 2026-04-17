import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiConfigService } from 'src/config/api-config.service';
import { ApiClsService } from 'src/lib/api-cls.service';
import { StripeService } from 'src/stripe/stripe.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: {
    getMySubscription: jest.Mock;
    findByUserId: jest.Mock;
    getUserEmail: jest.Mock;
    setStripeCustomerId: jest.Mock;
  };
  let stripeService: {
    getPriceIdForTier: jest.Mock;
    createCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    createPortalSession: jest.Mock;
  };
  let cls: { requireUserId: jest.Mock };

  beforeEach(async () => {
    subscriptionsService = {
      getMySubscription: jest.fn(),
      findByUserId: jest.fn(),
      getUserEmail: jest.fn(),
      setStripeCustomerId: jest.fn(),
    };
    stripeService = {
      getPriceIdForTier: jest.fn(),
      createCustomer: jest.fn(),
      createCheckoutSession: jest.fn(),
      createPortalSession: jest.fn(),
    };
    cls = {
      requireUserId: jest.fn().mockReturnValue('user_123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: StripeService, useValue: stripeService },
        { provide: ApiClsService, useValue: cls },
        {
          provide: ApiConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://app.mylegacymade.com'),
          },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /subscriptions/me', () => {
    it('delegates to subscriptionsService.getMySubscription and bubbles the result', async () => {
      const expected = { userId: 'user_123', tier: 'individual' };
      subscriptionsService.getMySubscription.mockResolvedValue(expected);

      await expect(controller.getMySubscription()).resolves.toBe(expected);
      expect(subscriptionsService.getMySubscription).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /subscriptions/checkout', () => {
    it('throws BadRequestException("Invalid tier") when the tier has no Stripe price ID', async () => {
      subscriptionsService.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_existing',
      });
      stripeService.getPriceIdForTier.mockReturnValue(null);

      await expect(
        controller.createCheckout({ tier: 'pro' as never }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'Invalid tier',
      });

      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws BadRequestException("User email not found") when the user has no email and no Stripe customer', async () => {
      subscriptionsService.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: null,
      });
      stripeService.getPriceIdForTier.mockReturnValue('price_individual_test');
      subscriptionsService.getUserEmail.mockResolvedValue(null);

      await expect(
        controller.createCheckout({ tier: 'individual' }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'User email not found',
      });

      expect(stripeService.createCustomer).not.toHaveBeenCalled();
      expect(subscriptionsService.setStripeCustomerId).not.toHaveBeenCalled();
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates a Stripe customer, persists the id, and returns the checkout URL when none exists', async () => {
      subscriptionsService.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: null,
      });
      stripeService.getPriceIdForTier.mockReturnValue('price_individual_test');
      subscriptionsService.getUserEmail.mockResolvedValue('user@example.com');
      stripeService.createCustomer.mockResolvedValue({ id: 'cus_new' });
      stripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/session_1',
      });

      const result = await controller.createCheckout({ tier: 'individual' });

      expect(stripeService.createCustomer).toHaveBeenCalledWith(
        'user@example.com',
        'user_123',
      );
      expect(subscriptionsService.setStripeCustomerId).toHaveBeenCalledWith(
        'user_123',
        'cus_new',
      );
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith({
        customerId: 'cus_new',
        priceId: 'price_individual_test',
        successUrl:
          'https://app.mylegacymade.com/settings/billing?success=true',
        cancelUrl:
          'https://app.mylegacymade.com/settings/billing?canceled=true',
      });
      expect(result).toEqual({ url: 'https://checkout.stripe.test/session_1' });
    });
  });

  describe('POST /subscriptions/portal', () => {
    it('throws BadRequestException("No Stripe customer found") when the subscription has no stripeCustomerId', async () => {
      subscriptionsService.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: null,
      });

      await expect(controller.createPortalSession()).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'No Stripe customer found',
      });

      expect(stripeService.createPortalSession).not.toHaveBeenCalled();
    });

    it('returns the portal URL from stripeService.createPortalSession on the happy path', async () => {
      subscriptionsService.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_existing',
      });
      stripeService.createPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.test/session_2',
      });

      const result = await controller.createPortalSession();

      expect(stripeService.createPortalSession).toHaveBeenCalledWith(
        'cus_existing',
        'https://app.mylegacymade.com/subscription/return',
      );
      expect(result).toEqual({ url: 'https://billing.stripe.test/session_2' });
    });
  });
});
