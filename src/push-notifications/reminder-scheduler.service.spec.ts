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

  beforeEach(async () => {
    mockPreferencesService = {
      getEligibleReminderUsers: jest.fn().mockResolvedValue([]),
    };

    mockPushNotifications = {
      sendToUser: jest.fn().mockResolvedValue({ tokens: 1, accepted: 1 }),
    };

    mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
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
    it('should send to all eligible users returned by the query', async () => {
      mockPreferencesService.getEligibleReminderUsers.mockResolvedValue([
        { userId: 'user_1', timezone: 'UTC', notifications: {} },
        { userId: 'user_2', timezone: 'UTC', notifications: {} },
      ]);

      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).toHaveBeenCalledTimes(2);
      expect(mockTx.insert).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no users are eligible', async () => {
      await service.sendReminders();

      expect(mockPushNotifications.sendToUser).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('should continue processing remaining users when one fails', async () => {
      mockPreferencesService.getEligibleReminderUsers.mockResolvedValue([
        { userId: 'user_1', timezone: 'UTC', notifications: {} },
        { userId: 'user_2', timezone: 'UTC', notifications: {} },
      ]);

      // First user's push send throws, second user succeeds
      mockPushNotifications.sendToUser
        .mockRejectedValueOnce(new Error('Push failed'))
        .mockResolvedValueOnce({ tokens: 1, accepted: 1 });

      await service.sendReminders();

      // Both users attempted; only the successful one is logged
      expect(mockPushNotifications.sendToUser).toHaveBeenCalledTimes(2);
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
    });

    it('should send the push before writing the log row', async () => {
      mockPreferencesService.getEligibleReminderUsers.mockResolvedValue([
        { userId: 'user_1', timezone: 'UTC', notifications: {} },
      ]);

      const callOrder: string[] = [];
      mockTx.insert.mockImplementation(() => {
        callOrder.push('insert');
        return mockTx;
      });
      mockPushNotifications.sendToUser.mockImplementation(() => {
        callOrder.push('push');
        return Promise.resolve({ tokens: 1, accepted: 1 });
      });

      await service.sendReminders();

      expect(callOrder).toEqual(['push', 'insert']);
    });

    it('should not log a reminder Expo accepted for no device', async () => {
      mockPreferencesService.getEligibleReminderUsers.mockResolvedValue([
        { userId: 'user_1', timezone: 'UTC', notifications: {} },
      ]);
      mockPushNotifications.sendToUser.mockResolvedValue({
        tokens: 0,
        accepted: 0,
      });

      await service.sendReminders();

      expect(mockTx.insert).not.toHaveBeenCalled();
    });
  });
});
