import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from 'src/stripe/stripe.service';
import { SubscriptionsService } from './subscriptions.service';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: StripeService,
          useValue: {
            constructWebhookEvent: jest.fn(),
            retrieveSubscription: jest.fn(),
            getTierForPriceId: jest.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            findByStripeCustomerId: jest.fn(),
            activateSubscription: jest.fn(),
            updateFromStripe: jest.fn(),
            cancelSubscription: jest.fn(),
            markPastDue: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
