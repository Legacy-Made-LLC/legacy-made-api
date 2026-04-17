import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from 'src/db/db.service';
import { ApiClsService } from 'src/lib/api-cls.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let mockDbService: { rls: jest.Mock; bypassRls: jest.Mock };

  beforeEach(async () => {
    mockDbService = {
      rls: jest.fn(),
      bypassRls: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: ApiClsService,
          useValue: {
            requireUserId: jest.fn().mockReturnValue('user_123'),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEventProcessed', () => {
    it('returns false when the event id has not been recorded', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]), // no rows
            }),
          }),
        };
        return cb(tx);
      });

      await expect(service.isEventProcessed('evt_new')).resolves.toBe(false);
    });

    it('returns true when the event id has already been recorded', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ eventId: 'evt_replayed' }]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(service.isEventProcessed('evt_replayed')).resolves.toBe(
        true,
      );
    });
  });

  describe('recordProcessedEvent', () => {
    it('inserts with onConflictDoNothing so duplicate inserts are a no-op', async () => {
      const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
      const values = jest.fn().mockReturnValue({ onConflictDoNothing });
      const insert = jest.fn().mockReturnValue({ values });

      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = { insert };
        return cb(tx);
      });

      await service.recordProcessedEvent(
        'evt_1',
        'customer.updated',
        'handled',
      );

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith({
        eventId: 'evt_1',
        eventType: 'customer.updated',
        outcome: 'handled',
      });
      // onConflictDoNothing is what makes the helper safe for races / replays.
      expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
      expect(onConflictDoNothing.mock.calls[0][0]).toMatchObject({
        target: expect.anything(),
      });
    });

    it('supports the "skipped" outcome for unhandled event types', async () => {
      const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
      const values = jest.fn().mockReturnValue({ onConflictDoNothing });
      const insert = jest.fn().mockReturnValue({ values });

      mockDbService.bypassRls.mockImplementation(async (cb) => cb({ insert }));

      await service.recordProcessedEvent('evt_2', 'unknown.event', 'skipped');

      expect(values).toHaveBeenCalledWith({
        eventId: 'evt_2',
        eventType: 'unknown.event',
        outcome: 'skipped',
      });
    });
  });

  describe('activateSubscription', () => {
    it('writes tier, all Stripe fields, and normalizes status to "active"', async () => {
      const returning = jest
        .fn()
        .mockResolvedValue([{ userId: 'user_abc', tier: 'individual' }]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      mockDbService.bypassRls.mockImplementation(async (cb) => cb({ update }));

      const periodEnd = new Date('2026-05-01T00:00:00.000Z');
      await service.activateSubscription({
        userId: 'user_abc',
        tier: 'individual',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_individual_test',
        currentPeriodEnd: periodEnd,
      });

      expect(set).toHaveBeenCalledWith({
        tier: 'individual',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_individual_test',
        status: 'active',
        currentPeriodEnd: periodEnd,
      });
    });
  });

  describe('cancelSubscription', () => {
    it('writes status "canceled" and downgrades the tier to free', async () => {
      const returning = jest.fn().mockResolvedValue([{ tier: 'free' }]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      mockDbService.bypassRls.mockImplementation(async (cb) => cb({ update }));

      await service.cancelSubscription('sub_goodbye');

      // The critical field is status — Phase 3.4 adds a check constraint and
      // Phase 3.6's expiration cron uses status to avoid double-downgrades.
      expect(set).toHaveBeenCalledWith({
        tier: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
      });
    });
  });
});
