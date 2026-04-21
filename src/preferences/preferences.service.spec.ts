import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockTx: any;

  const mockClsService = {
    requireUserId: jest.fn().mockReturnValue('user_123'),
    get: jest.fn().mockReturnValue('user_123'),
  };

  beforeEach(async () => {
    const mockReturning = jest.fn().mockResolvedValue([]);

    // Create a chainable result from where() that also works as a thenable
    const whereResult = {
      returning: mockReturning,
      limit: jest.fn().mockResolvedValue([]),
      then: (resolve: any) => resolve([]),
    };

    mockTx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue(whereResult),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: mockReturning,
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const mockDbService = {
      rls: jest.fn((cb) => cb(mockTx)),
      bypassRls: jest.fn((cb) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return defaults when no row exists', async () => {
      const result = await service.getPreferences();

      expect(result.userId).toBe('user_123');
      expect(result.timezone).toBe('UTC');
      expect(result.updatedAt).toBeNull();
    });

    it('should parse and return existing row with Zod defaults', async () => {
      mockTx.where.mockReturnValueOnce({
        returning: jest.fn(),
        limit: jest.fn(),
        then: (resolve: any) =>
          resolve([
            {
              userId: 'user_123',
              timezone: 'America/Denver',
              notifications: { reminders: { enabled: true } },
              updatedAt: new Date(),
            },
          ]),
      });

      const result = await service.getPreferences();

      expect(result.timezone).toBe('America/Denver');
      expect(result.notifications.reminders?.enabled).toBe(true);
      expect(result.notifications.reminders?.frequency).toBe('weekly');
    });
  });

  describe('updateNotifications', () => {
    it('should deep-merge reminders preserving existing values', async () => {
      const existingRow = {
        userId: 'user_123',
        timezone: 'UTC',
        notifications: {
          reminders: { enabled: false, frequency: 'weekly' },
        },
        updatedAt: new Date(),
      };

      const updatedRow = {
        userId: 'user_123',
        timezone: 'UTC',
        notifications: {
          reminders: {
            enabled: true,
            frequency: 'weekly',
            enabled_at: '2026-03-30T00:00:00.000Z',
          },
        },
        updatedAt: new Date(),
      };

      // First where() call: select existing
      mockTx.where.mockReturnValueOnce({
        returning: jest.fn(),
        limit: jest.fn(),
        then: (resolve: any) => resolve([existingRow]),
      });

      // Second where() call: update().set().where().returning()
      mockTx.where.mockReturnValueOnce({
        returning: jest.fn().mockResolvedValue([updatedRow]),
        limit: jest.fn(),
        then: (resolve: any) => resolve([updatedRow]),
      });

      const result = await service.updateNotifications({
        reminders: { enabled: true },
      });

      expect(result.notifications.reminders?.enabled).toBe(true);
      expect(result.notifications.reminders?.frequency).toBe('weekly');
    });

    it('should set enabled_at when transitioning from disabled to enabled', async () => {
      const existingRow = {
        userId: 'user_123',
        timezone: 'UTC',
        notifications: {
          reminders: {
            enabled: false,
            frequency: 'weekly',
            enabled_at: null,
          },
        },
        updatedAt: new Date(),
      };

      // First where(): select existing
      mockTx.where.mockReturnValueOnce({
        returning: jest.fn(),
        limit: jest.fn(),
        then: (resolve: any) => resolve([existingRow]),
      });

      // Second where(): update - capture the set() call to verify enabled_at
      const setCalls: any[] = [];
      mockTx.set.mockImplementation((data: any) => {
        setCalls.push(data);
        return mockTx;
      });
      mockTx.where.mockReturnValueOnce({
        returning: jest.fn().mockResolvedValue([
          {
            ...existingRow,
            notifications: {
              reminders: {
                ...existingRow.notifications.reminders,
                enabled: true,
              },
            },
          },
        ]),
        limit: jest.fn(),
        then: (resolve: any) => resolve([]),
      });

      await service.updateNotifications({ reminders: { enabled: true } });

      // Verify the merged notifications include enabled_at
      expect(setCalls.length).toBeGreaterThan(0);
      const notifications = setCalls[0].notifications;
      expect(notifications.reminders.enabled).toBe(true);
      expect(notifications.reminders.enabled_at).toBeDefined();
      expect(notifications.reminders.enabled_at).not.toBeNull();
    });
  });

  describe('ensurePreferencesExist', () => {
    it('should insert with defaults using onConflictDoNothing', async () => {
      await service.ensurePreferencesExist('user_456');

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.onConflictDoNothing).toHaveBeenCalled();
    });
  });

  describe('getEligibleReminderUsers', () => {
    it('should execute raw SQL and map results', async () => {
      mockTx.execute.mockResolvedValue({
        rows: [
          {
            user_id: 'user_1',
            timezone: 'UTC',
            notifications: { reminders: { enabled: true } },
          },
        ],
      });

      const result = await service.getEligibleReminderUsers();

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user_1');
      expect(mockTx.execute).toHaveBeenCalled();
    });
  });
});
