import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from 'src/stripe/stripe.service';
import { ApiClsService } from 'src/lib/api-cls.service';
import { ApiConfigService } from 'src/config/api-config.service';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: {
            getMySubscription: jest.fn(),
            findByUserId: jest.fn(),
            getUserEmail: jest.fn(),
            setStripeCustomerId: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            getPriceIdForTier: jest.fn(),
            createCustomer: jest.fn(),
            createCheckoutSession: jest.fn(),
            createPortalSession: jest.fn(),
          },
        },
        {
          provide: ApiClsService,
          useValue: {
            requireUserId: jest.fn().mockReturnValue('user_123'),
          },
        },
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
});
