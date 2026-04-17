import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import {
  ExpiredSubscription,
  SubscriptionExpirationService,
} from './subscription-expiration.service';

describe('SubscriptionExpirationService', () => {
  let service: SubscriptionExpirationService;
  let mockDbService: { bypassRls: jest.Mock };

  beforeEach(async () => {
    mockDbService = {
      bypassRls: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionExpirationService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<SubscriptionExpirationService>(
      SubscriptionExpirationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findExpiredSubscriptions', () => {
    it('should query for expired subscriptions past grace period', async () => {
      const mockExpired: ExpiredSubscription[] = [
        {
          id: 'sub-1',
          userId: 'user-1',
          tier: 'individual',
          currentPeriodEnd: new Date('2024-01-01'),
        },
      ];

      mockDbService.bypassRls.mockImplementation(async (callback) => {
        // Mock the transaction with select chain
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockExpired),
            }),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.findExpiredSubscriptions();
      expect(result).toEqual(mockExpired);
      expect(mockDbService.bypassRls).toHaveBeenCalled();
    });
  });

  describe('downgradeExpiredSubscriptions', () => {
    it('should return empty array when no subscriptions provided', async () => {
      const result = await service.downgradeExpiredSubscriptions([]);
      expect(result).toEqual([]);
      expect(mockDbService.bypassRls).not.toHaveBeenCalled();
    });

    it('should downgrade provided subscriptions to free tier', async () => {
      const expired: ExpiredSubscription[] = [
        {
          id: 'sub-1',
          userId: 'user-1',
          tier: 'individual',
          currentPeriodEnd: new Date('2024-01-01'),
        },
        {
          id: 'sub-2',
          userId: 'user-2',
          tier: 'family',
          currentPeriodEnd: new Date('2024-01-02'),
        },
      ];

      mockDbService.bypassRls.mockImplementation(async (callback) => {
        const mockTx = {
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.downgradeExpiredSubscriptions(expired);
      expect(result).toEqual(expired);
      expect(mockDbService.bypassRls).toHaveBeenCalled();
    });

    it('should write status "canceled" (not just drop tier to free) so the cron does not double-downgrade', async () => {
      const expired: ExpiredSubscription[] = [
        {
          id: 'sub-1',
          userId: 'user-1',
          tier: 'individual',
          currentPeriodEnd: new Date('2024-01-01'),
        },
      ];

      // Capture the args passed to .set() so we can assert both tier and status.
      const setSpy = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      mockDbService.bypassRls.mockImplementation(async (callback) => {
        const mockTx = {
          update: jest.fn().mockReturnValue({ set: setSpy }),
        };
        return callback(mockTx);
      });

      await service.downgradeExpiredSubscriptions(expired);

      expect(setSpy).toHaveBeenCalledWith({
        tier: 'free',
        status: 'canceled',
      });
    });
  });

  describe('findExpiredSubscriptions status filter', () => {
    it('passes a WHERE clause that excludes already-canceled rows', async () => {
      // The filter logic lives inside a Drizzle WHERE expression, so we can't
      // "observe" rows being filtered without a real DB. What we can verify is
      // that the WHERE clause passed to drizzle references the `status` column
      // — if the guard were removed, that reference would disappear and this
      // test would fail.
      let capturedWhereArg: unknown = null;
      mockDbService.bypassRls.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockImplementation((arg: unknown) => {
                capturedWhereArg = arg;
                return Promise.resolve([]);
              }),
            }),
          }),
        };
        return callback(mockTx);
      });

      await service.findExpiredSubscriptions();

      // Walk the drizzle expression tree (which has cycles from PgTable <-> PgColumn)
      // and collect every string literal / column name we encounter. If the
      // 'canceled' guard or the status reference is removed, this test fails.
      const seen = new WeakSet<object>();
      const strings: string[] = [];
      const walk = (value: unknown) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'string') {
          strings.push(value);
          return;
        }
        if (typeof value !== 'object') return;
        if (seen.has(value as object)) return;
        seen.add(value as object);
        for (const key of Object.keys(value as Record<string, unknown>)) {
          walk((value as Record<string, unknown>)[key]);
        }
      };
      walk(capturedWhereArg);

      expect(strings).toEqual(expect.arrayContaining(['status', 'canceled']));
    });
  });

  describe('handleExpiredSubscriptions', () => {
    it('should find and downgrade expired subscriptions', async () => {
      const expired: ExpiredSubscription[] = [
        {
          id: 'sub-1',
          userId: 'user-1',
          tier: 'individual',
          currentPeriodEnd: new Date('2024-01-01'),
        },
      ];

      jest
        .spyOn(service, 'findExpiredSubscriptions')
        .mockResolvedValue(expired);
      jest
        .spyOn(service, 'downgradeExpiredSubscriptions')
        .mockResolvedValue(expired);

      await service.handleExpiredSubscriptions();

      expect(service.findExpiredSubscriptions).toHaveBeenCalled();
      expect(service.downgradeExpiredSubscriptions).toHaveBeenCalledWith(
        expired,
      );
    });

    it('should not call downgrade when no expired subscriptions found', async () => {
      jest.spyOn(service, 'findExpiredSubscriptions').mockResolvedValue([]);
      jest.spyOn(service, 'downgradeExpiredSubscriptions');

      await service.handleExpiredSubscriptions();

      expect(service.findExpiredSubscriptions).toHaveBeenCalled();
      expect(service.downgradeExpiredSubscriptions).not.toHaveBeenCalled();
    });
  });
});
