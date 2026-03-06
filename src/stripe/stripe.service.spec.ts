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
});
