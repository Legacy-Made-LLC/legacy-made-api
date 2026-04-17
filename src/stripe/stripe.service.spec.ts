import { Test, TestingModule } from '@nestjs/testing';
import { StripeService } from './stripe.service';
import { ApiConfigService } from 'src/config/api-config.service';

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: ApiConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                STRIPE_SECRET_KEY: 'sk_test_fake',
                STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
                STRIPE_PRICE_ID_INDIVIDUAL: 'price_individual_test',
                STRIPE_PRICE_ID_FAMILY: 'price_family_test',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should map price IDs to tiers', () => {
    expect(service.getTierForPriceId('price_individual_test')).toBe(
      'individual',
    );
    expect(service.getTierForPriceId('price_family_test')).toBe('family');
    expect(service.getTierForPriceId('price_unknown')).toBeUndefined();
  });

  it('should map tiers to price IDs', () => {
    expect(service.getPriceIdForTier('individual')).toBe(
      'price_individual_test',
    );
    expect(service.getPriceIdForTier('family')).toBe('price_family_test');
    expect(service.getPriceIdForTier('free')).toBeUndefined();
  });

  it('price-id ↔ tier round-trip is symmetric for every paid tier', () => {
    for (const tier of ['individual', 'family'] as const) {
      const priceId = service.getPriceIdForTier(tier);
      expect(priceId).toBeDefined();
      expect(service.getTierForPriceId(priceId!)).toBe(tier);
    }
  });

  describe('constructWebhookEvent', () => {
    it('delegates to Stripe SDK webhooks.constructEvent and returns the event', () => {
      const fakeEvent = {
        id: 'evt_1',
        type: 'customer.subscription.updated',
      };
      // Replace the private Stripe client with a stub that records the call.
      const constructEvent = jest.fn().mockReturnValue(fakeEvent);
      (service as unknown as { stripe: { webhooks: unknown } }).stripe = {
        webhooks: { constructEvent },
      };

      const body = Buffer.from('{"id":"evt_1"}');
      const result = service.constructWebhookEvent(body, 'sig_abc');

      expect(constructEvent).toHaveBeenCalledWith(
        body,
        'sig_abc',
        'whsec_test_fake',
      );
      expect(result).toBe(fakeEvent);
    });

    it('propagates the SDK error when signature verification fails', () => {
      const constructEvent = jest.fn().mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });
      (service as unknown as { stripe: { webhooks: unknown } }).stripe = {
        webhooks: { constructEvent },
      };

      expect(() =>
        service.constructWebhookEvent(Buffer.from('{}'), 'bad'),
      ).toThrow('No signatures found matching the expected signature');
    });
  });
});
