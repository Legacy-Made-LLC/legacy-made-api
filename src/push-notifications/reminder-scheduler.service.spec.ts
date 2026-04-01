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
      sendToUser: jest.fn().mockResolvedValue(undefined),
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

      // First user's push send throws (transaction rolls back),
      // second user succeeds
      mockPushNotifications.sendToUser
        .mockRejectedValueOnce(new Error('Push failed'))
        .mockResolvedValueOnce(undefined);

      await service.sendReminders();

      // Both users should be attempted
      expect(mockPushNotifications.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('should insert log row before sending push within same transaction', async () => {
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
        return Promise.resolve();
      });

      await service.sendReminders();

      expect(callOrder).toEqual(['insert', 'push']);
    });
  });
});
