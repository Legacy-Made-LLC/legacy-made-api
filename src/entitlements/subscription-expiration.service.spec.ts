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
