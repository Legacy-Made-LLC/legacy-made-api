import { Test, TestingModule } from '@nestjs/testing';
import { ApiConfigService } from 'src/config/api-config.service';
import { DbService } from 'src/db/db.service';
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

/**
 * Build a chainable tx mock that records every `.set()` argument so tests can
 * assert what fields were written (notably `tier`) without wiring a real DB.
 * `.returning()` resolves to [{ userId }] by default so the unmatched-user
 * warn log doesn't fire; override via `returningResult` when testing that path.
 */
function makeTxMock(opts: { returningResult?: unknown[] } = {}) {
  const setCalls: Record<string, unknown>[] = [];
  const insertValues: Record<string, unknown>[] = [];
  const returning = jest
    .fn()
    .mockResolvedValue(opts.returningResult ?? [{ userId: 'user_abc' }]);
  const chain: Record<string, unknown> = {};
  chain.update = () => chain;
  chain.set = (vals: Record<string, unknown>) => {
    setCalls.push(vals);
    return chain;
  };
  chain.where = () => chain;
  chain.returning = returning;
  chain.insert = () => chain;
  chain.values = (vals: Record<string, unknown>) => {
    insertValues.push(vals);
    return chain;
  };
  chain.onConflictDoNothing = () => Promise.resolve(undefined);
  chain.select = () => chain;
  chain.from = () => chain;
  // Make the chain itself thenable so `await tx.select().from().where()`
  // (the shape used by isEventProcessed) resolves to [].
  const terminal = Promise.resolve([] as unknown[]);
  (chain as { then: typeof terminal.then }).then = terminal.then.bind(terminal);
  return { chain, setCalls, insertValues, returning };
}

describe('RevenuecatService', () => {
  let service: RevenuecatService;
  let bypassRls: jest.Mock;
  let tx: ReturnType<typeof makeTxMock>;

  beforeEach(async () => {
    tx = makeTxMock();
    bypassRls = jest.fn(async (fn: (t: unknown) => unknown) => fn(tx.chain));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenuecatService,
        { provide: DbService, useValue: { bypassRls } },
        { provide: ApiConfigService, useValue: makeConfigMock() },
      ],
    }).compile();

    service = module.get<RevenuecatService>(RevenuecatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEvent dispatch', () => {
    it('INITIAL_PURCHASE with individual entitlement writes tier=individual', async () => {
      const outcome = await service.processEvent(makeEvent());
      expect(outcome).toBe('handled');
      expect(tx.setCalls).toEqual([
        expect.objectContaining({ tier: 'individual', status: 'active' }),
      ]);
    });

    it('INITIAL_PURCHASE with family entitlement writes tier=family', async () => {
      await service.processEvent(makeEvent({ entitlement_ids: ['family'] }));
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'family' }),
      );
    });

    it('falls back to single entitlement_id when entitlement_ids missing', async () => {
      await service.processEvent(
        makeEvent({ entitlement_ids: null, entitlement_id: 'individual' }),
      );
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'individual' }),
      );
    });

    it('INITIAL_PURCHASE with unmapped entitlement skips subscription write but counts as handled', async () => {
      const outcome = await service.processEvent(
        makeEvent({ entitlement_ids: ['premium_plus_unknown'] }),
      );
      expect(outcome).toBe('handled');
      expect(tx.setCalls).toEqual([]);
    });

    it('CANCELLATION sets unsubscribeDetectedAt and does not change tier', async () => {
      const outcome = await service.processEvent(
        makeEvent({ type: 'CANCELLATION' }),
      );
      expect(outcome).toBe('handled');
      expect(tx.setCalls).toHaveLength(1);
      expect(tx.setCalls[0]).toHaveProperty('unsubscribeDetectedAt');
      expect(tx.setCalls[0]).not.toHaveProperty('tier');
    });

    it('EXPIRATION clears RC fields and writes tier=free in a single update', async () => {
      await service.processEvent(makeEvent({ type: 'EXPIRATION' }));
      expect(tx.setCalls).toHaveLength(1);
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({
          tier: 'free',
          status: 'expired',
          rcOriginalTransactionId: null,
          rcProductId: null,
          rcStore: null,
          currentPeriodEnd: null,
        }),
      );
    });

    it('SUBSCRIPTION_PAUSED is treated as expiration', async () => {
      await service.processEvent(makeEvent({ type: 'SUBSCRIPTION_PAUSED' }));
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'free', status: 'expired' }),
      );
    });

    it('RENEWAL re-applies active state', async () => {
      const outcome = await service.processEvent(
        makeEvent({ type: 'RENEWAL' }),
      );
      expect(outcome).toBe('handled');
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'individual', status: 'active' }),
      );
    });

    it('UNCANCELLATION re-applies active state', async () => {
      await service.processEvent(makeEvent({ type: 'UNCANCELLATION' }));
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'individual', status: 'active' }),
      );
    });

    it('PRODUCT_CHANGE updates tier and product id', async () => {
      await service.processEvent(
        makeEvent({
          type: 'PRODUCT_CHANGE',
          entitlement_ids: ['family'],
          new_product_id: 'com.legacymade.family.yearly',
        }),
      );
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({
          tier: 'family',
          rcProductId: 'com.legacymade.family.yearly',
        }),
      );
    });

    it('BILLING_ISSUE sets grace period status without touching tier', async () => {
      const outcome = await service.processEvent(
        makeEvent({
          type: 'BILLING_ISSUE',
          grace_period_expiration_at_ms: 1893456000000,
        }),
      );
      expect(outcome).toBe('handled');
      expect(tx.setCalls[0]).toEqual(
        expect.objectContaining({ status: 'in_grace_period' }),
      );
      expect(tx.setCalls[0]).not.toHaveProperty('tier');
    });

    it.each(['TEST', 'SUBSCRIBER_ALIAS', 'TRANSFER', 'NON_RENEWING_PURCHASE'])(
      '%s returns skipped without touching subscriptions',
      async (type) => {
        const outcome = await service.processEvent(
          makeEvent({ type: type as RcWebhookEvent['type'] }),
        );
        expect(outcome).toBe('skipped');
        expect(tx.setCalls).toEqual([]);
      },
    );

    it('records the event in the same transaction as the dispatch', async () => {
      await service.processEvent(makeEvent());
      // Exactly one bypassRls call wraps both the subscription write and the
      // processed_revenuecat_events insert — if they ran in separate
      // transactions, bypassRls would be called multiple times.
      expect(bypassRls).toHaveBeenCalledTimes(1);
      expect(tx.insertValues).toEqual([
        expect.objectContaining({
          eventId: 'evt_1',
          eventType: 'INITIAL_PURCHASE',
          outcome: 'handled',
        }),
      ]);
    });
  });

  describe('configurable entitlement identifiers', () => {
    it('honors a custom entitlement identifier from config', async () => {
      const customTx = makeTxMock();
      const customBypassRls = jest.fn(async (fn: (t: unknown) => unknown) =>
        fn(customTx.chain),
      );
      const module = await Test.createTestingModule({
        providers: [
          RevenuecatService,
          { provide: DbService, useValue: { bypassRls: customBypassRls } },
          {
            provide: ApiConfigService,
            useValue: makeConfigMock({
              RC_ENTITLEMENT_ID_INDIVIDUAL: 'legacy_made_individual',
            }),
          },
        ],
      }).compile();
      const customService = module.get<RevenuecatService>(RevenuecatService);

      await customService.processEvent(
        makeEvent({ entitlement_ids: ['legacy_made_individual'] }),
      );
      expect(customTx.setCalls[0]).toEqual(
        expect.objectContaining({ tier: 'individual' }),
      );

      // The default identifier is no longer recognized.
      customTx.setCalls.length = 0;
      await customService.processEvent(
        makeEvent({ entitlement_ids: ['individual'] }),
      );
      expect(customTx.setCalls).toEqual([]);
    });
  });

  describe('idempotency wrapper', () => {
    it('isEventProcessed calls bypassRls', async () => {
      await service.isEventProcessed('evt_1');
      expect(bypassRls).toHaveBeenCalled();
    });
  });
});
