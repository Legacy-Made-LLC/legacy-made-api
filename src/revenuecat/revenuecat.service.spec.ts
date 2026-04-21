import { Test, TestingModule } from '@nestjs/testing';
import { ApiConfigService } from 'src/config/api-config.service';
import { DbService } from 'src/db/db.service';
import { EntitlementsService } from 'src/entitlements/entitlements.service';
import { RevenuecatService } from './revenuecat.service';
import type { RcWebhookEvent } from './dto/webhook.dto';

function makeConfigMock(overrides: Record<string, string> = {}): {
  get: jest.Mock;
} {
  const defaults: Record<string, string> = {
    RC_ENTITLEMENT_ID_INDIVIDUAL: 'individual',
    RC_ENTITLEMENT_ID_FAMILY: 'family',
  };
  const values = { ...defaults, ...overrides };
  return { get: jest.fn((key: string) => values[key]) };
}

function makeEvent(overrides: Partial<RcWebhookEvent> = {}): RcWebhookEvent {
  return {
    type: 'INITIAL_PURCHASE',
    id: 'evt_1',
    app_user_id: 'user_abc',
    entitlement_ids: ['individual'],
    product_id: 'com.legacymade.individual.monthly',
    original_transaction_id: 'tx_123',
    expiration_at_ms: 1893456000000, // 2030-01-01
    store: 'APP_STORE',
    ...overrides,
  };
}

describe('RevenuecatService', () => {
  let service: RevenuecatService;
  let updateTier: jest.Mock;
  let bypassRls: jest.Mock;

  beforeEach(async () => {
    updateTier = jest.fn().mockResolvedValue(undefined);
    // Return whatever the inner callback resolves to. Tests don't assert on
    // the SQL builder — DB interaction is covered by integration tests.
    bypassRls = jest.fn(async (fn: (tx: unknown) => unknown) => {
      // Minimal chainable stub: every method returns `this`, terminal calls
      // resolve to [] / undefined.
      const chain: Record<string, unknown> = {};
      const terminal = Promise.resolve([]);
      const methods = [
        'select',
        'from',
        'where',
        'insert',
        'values',
        'onConflictDoNothing',
        'update',
        'set',
        'returning',
      ];
      for (const m of methods) {
        chain[m] = () => chain;
      }
      // Make the chain thenable so `await tx.update().set().where()` resolves.
      (chain as { then: typeof terminal.then }).then =
        terminal.then.bind(terminal);
      return fn(chain);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenuecatService,
        { provide: DbService, useValue: { bypassRls } },
        { provide: EntitlementsService, useValue: { updateTier } },
        { provide: ApiConfigService, useValue: makeConfigMock() },
      ],
    }).compile();

    service = module.get<RevenuecatService>(RevenuecatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEvent dispatch', () => {
    it('INITIAL_PURCHASE with individual entitlement updates tier to individual', async () => {
      const outcome = await service.handleEvent(makeEvent());
      expect(outcome).toBe('handled');
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'individual');
    });

    it('INITIAL_PURCHASE with family entitlement updates tier to family', async () => {
      await service.handleEvent(makeEvent({ entitlement_ids: ['family'] }));
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'family');
    });

    it('falls back to single entitlement_id when entitlement_ids missing', async () => {
      await service.handleEvent(
        makeEvent({ entitlement_ids: null, entitlement_id: 'individual' }),
      );
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'individual');
    });

    it('INITIAL_PURCHASE with unmapped entitlement skips tier update but still counts as handled', async () => {
      const outcome = await service.handleEvent(
        makeEvent({ entitlement_ids: ['premium_plus_unknown'] }),
      );
      expect(outcome).toBe('handled');
      expect(updateTier).not.toHaveBeenCalled();
    });

    it('CANCELLATION does not change tier (access continues until expiration)', async () => {
      const outcome = await service.handleEvent(
        makeEvent({ type: 'CANCELLATION' }),
      );
      expect(outcome).toBe('handled');
      expect(updateTier).not.toHaveBeenCalled();
    });

    it('EXPIRATION downgrades tier to free', async () => {
      await service.handleEvent(makeEvent({ type: 'EXPIRATION' }));
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'free');
    });

    it('SUBSCRIPTION_PAUSED is treated as expiration', async () => {
      await service.handleEvent(makeEvent({ type: 'SUBSCRIPTION_PAUSED' }));
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'free');
    });

    it('RENEWAL re-applies active state', async () => {
      const outcome = await service.handleEvent(makeEvent({ type: 'RENEWAL' }));
      expect(outcome).toBe('handled');
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'individual');
    });

    it('UNCANCELLATION re-applies active state', async () => {
      await service.handleEvent(makeEvent({ type: 'UNCANCELLATION' }));
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'individual');
    });

    it('PRODUCT_CHANGE updates tier when entitlement resolves', async () => {
      await service.handleEvent(
        makeEvent({ type: 'PRODUCT_CHANGE', entitlement_ids: ['family'] }),
      );
      expect(updateTier).toHaveBeenCalledWith('user_abc', 'family');
    });

    it('BILLING_ISSUE does not change tier (grace period)', async () => {
      const outcome = await service.handleEvent(
        makeEvent({
          type: 'BILLING_ISSUE',
          grace_period_expiration_at_ms: 1893456000000,
        }),
      );
      expect(outcome).toBe('handled');
      expect(updateTier).not.toHaveBeenCalled();
    });

    it.each(['TEST', 'SUBSCRIBER_ALIAS', 'TRANSFER', 'NON_RENEWING_PURCHASE'])(
      '%s returns skipped without touching tier',
      async (type) => {
        const outcome = await service.handleEvent(
          makeEvent({ type: type as RcWebhookEvent['type'] }),
        );
        expect(outcome).toBe('skipped');
        expect(updateTier).not.toHaveBeenCalled();
      },
    );
  });

  describe('configurable entitlement identifiers', () => {
    it('honors a custom entitlement identifier from config', async () => {
      const customUpdateTier = jest.fn().mockResolvedValue(undefined);
      const module = await Test.createTestingModule({
        providers: [
          RevenuecatService,
          { provide: DbService, useValue: { bypassRls } },
          {
            provide: EntitlementsService,
            useValue: { updateTier: customUpdateTier },
          },
          {
            provide: ApiConfigService,
            useValue: makeConfigMock({
              RC_ENTITLEMENT_ID_INDIVIDUAL: 'legacy_made_individual',
            }),
          },
        ],
      }).compile();
      const customService = module.get<RevenuecatService>(RevenuecatService);

      await customService.handleEvent(
        makeEvent({ entitlement_ids: ['legacy_made_individual'] }),
      );
      expect(customUpdateTier).toHaveBeenCalledWith('user_abc', 'individual');

      // The default identifier is no longer recognized.
      customUpdateTier.mockClear();
      await customService.handleEvent(
        makeEvent({ entitlement_ids: ['individual'] }),
      );
      expect(customUpdateTier).not.toHaveBeenCalled();
    });
  });

  describe('idempotency wrappers', () => {
    it('isEventProcessed calls bypassRls', async () => {
      await service.isEventProcessed('evt_1');
      expect(bypassRls).toHaveBeenCalled();
    });

    it('recordProcessedEvent calls bypassRls', async () => {
      await service.recordProcessedEvent(
        'evt_1',
        'INITIAL_PURCHASE',
        'handled',
      );
      expect(bypassRls).toHaveBeenCalled();
    });
  });
});
