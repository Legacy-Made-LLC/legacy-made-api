import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

describe('PreferencesController', () => {
  let controller: PreferencesController;

  const mockPreferencesService = {
    getPreferences: jest.fn().mockResolvedValue({
      userId: 'user_123',
      timezone: 'UTC',
      notifications: {},
      updatedAt: null,
    }),
    updateNotifications: jest.fn().mockResolvedValue({
      userId: 'user_123',
      timezone: 'UTC',
      notifications: { reminders: { enabled: true } },
      updatedAt: new Date(),
    }),
    upsertTimezone: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        { provide: PreferencesService, useValue: mockPreferencesService },
      ],
    }).compile();

    controller = module.get<PreferencesController>(PreferencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should call service.getPreferences', async () => {
      await controller.getPreferences();
      expect(mockPreferencesService.getPreferences).toHaveBeenCalled();
    });
  });

  describe('updateNotifications', () => {
    it('should call service.updateNotifications with dto.notifications', async () => {
      const dto = { notifications: { reminders: { enabled: true } } } as any;
      await controller.updateNotifications(dto);
      expect(mockPreferencesService.updateNotifications).toHaveBeenCalledWith(
        dto.notifications,
      );
    });
  });

  describe('updateTimezone', () => {
    it('should call service.upsertTimezone with dto.timezone', async () => {
      const dto = { timezone: 'America/Denver' } as any;
      await controller.updateTimezone(dto);
      expect(mockPreferencesService.upsertTimezone).toHaveBeenCalledWith(
        'America/Denver',
      );
    });
  });
});
