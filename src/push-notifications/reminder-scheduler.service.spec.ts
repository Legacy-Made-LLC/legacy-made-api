import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { PreferencesService } from '../preferences/preferences.service';
import { PushNotificationsService } from './push-notifications.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

describe('ReminderSchedulerService', () => {
  let service: ReminderSchedulerService;
  let mockPreferencesService: any;
  let mockPushNotifications: any;
  let mockTx: any;
  let claimRows: { id: string }[];

  beforeEach(async () => {
    mockPreferencesService = {
      getEligibleReminderUsers: jest.fn().mockResolvedValue([]),
    };

    mockPushNotifications = {
      sendToUser: jest.fn().mockResolvedValue({ tokens: 1, accepted: 1 }),
    };

    // execute: advisory lock, then the claim insert (returns the claim id)
    claimRows = [{ id: 'claim-1' }];
    mockTx = {
      execute: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ rows: claimRows })),
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    };

    const mockDbService = {
      bypassRls: jest.fn((cb) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: PreferencesService, useValue: mockPreferencesService },
        {
          provide: PushNotificationsService,
          useValue: mockPushNotifications,
        },
        { provide: DbService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<ReminderSchedulerService>(ReminderSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendReminders', () => {
    const eligible = (...userIds: string[]) =>
      mockPreferencesService.getEligibleReminderUsers.mockResolvedValue(
        userIds.map((userId) => ({
          userId,
          timezone: 'UTC',
          notifications: {},
        })),
      );

    it('should claim and send for every eligible user', async () => {
      eligible('user_1', 'user_2');

      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).toHaveBeenCalledTimes(2);
      // lock + claim insert per user
      expect(mockTx.execute).toHaveBeenCalledTimes(4);
      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it('should do nothing when no users are eligible', async () => {
      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).not.toHaveBeenCalled();
      expect(mockTx.execute).not.toHaveBeenCalled();
    });

    it('should claim the slot before sending', async () => {
      eligible('user_1');
      const callOrder: string[] = [];
      mockTx.execute.mockImplementation(() => {
        callOrder.push('claim');
        return Promise.resolve({ rows: claimRows });
      });
      mockPushNotifications.sendToUser.mockImplementation(() => {
        callOrder.push('push');
        return Promise.resolve({ tokens: 1, accepted: 1 });
      });

      await service.sendReminders();

      expect(callOrder).toEqual(['claim', 'claim', 'push']);
    });

    it('should skip a user whose slot is already claimed', async () => {
      eligible('user_1');
      claimRows = [];

      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).not.toHaveBeenCalled();
    });

    it('should release the claim when Expo accepted it for no device', async () => {
      eligible('user_1');
      mockPushNotifications.sendToUser.mockResolvedValue({
        tokens: 0,
        accepted: 0,
      });

      await service.sendReminders();

      expect(mockTx.delete).toHaveBeenCalledTimes(1);
    });

    it('should release the claim and continue when a send throws', async () => {
      eligible('user_1', 'user_2');
      mockPushNotifications.sendToUser
        .mockRejectedValueOnce(new Error('Push failed'))
        .mockResolvedValueOnce({ tokens: 1, accepted: 1 });

      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).toHaveBeenCalledTimes(2);
      expect(mockTx.delete).toHaveBeenCalledTimes(1);
    });
  });
});
