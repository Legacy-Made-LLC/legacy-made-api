import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationsService } from './push-notifications.service';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { ApiConfigService } from '../config/api-config.service';
import { PreferencesService } from '../preferences/preferences.service';

// Mock expo-server-sdk — use inline jest.fn() to avoid hoisting issues
jest.mock('expo-server-sdk', () => {
  const sendPushNotificationsAsync = jest.fn();
  const chunkPushNotifications = jest.fn((msgs: unknown[]) => [msgs]);
  const isExpoPushToken = jest.fn(() => true);

  const MockExpo: any = jest.fn().mockImplementation(() => ({
    sendPushNotificationsAsync,
    chunkPushNotifications,
  }));
  MockExpo.isExpoPushToken = isExpoPushToken;

  // Attach refs for test access
  MockExpo.__mocks = {
    sendPushNotificationsAsync,
    chunkPushNotifications,
    isExpoPushToken,
  };

  return { __esModule: true, default: MockExpo };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExpoMock = require('expo-server-sdk').default;
const {
  sendPushNotificationsAsync: mockSendPushNotificationsAsync,
  chunkPushNotifications: mockChunkPushNotifications,
  isExpoPushToken: mockIsExpoPushToken,
} = ExpoMock.__mocks;

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    requireUserId: jest.fn().mockReturnValue('user-123'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'PUSH_NOTIFICATION_ALLOWLIST') return [];
      return undefined;
    }),
  };

  const mockPreferencesService = {
    ensurePreferencesExist: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
        { provide: ApiConfigService, useValue: mockConfigService },
        { provide: PreferencesService, useValue: mockPreferencesService },
      ],
    }).compile();

    service = module.get<PushNotificationsService>(PushNotificationsService);
    jest.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // sendToUser
  // =========================================================================

  describe('sendToUser', () => {
    function mockTokensForUser(tokens: string[]) {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest
                .fn()
                .mockResolvedValue(tokens.map((t) => ({ token: t }))),
            }),
          }),
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        };
        return cb(tx);
      });
    }

    it('should send notification to all devices', async () => {
      mockTokensForUser(['ExponentPushToken[abc]', 'ExponentPushToken[def]']);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: 'ok' },
        { status: 'ok' },
      ]);

      await service.sendToUser('user-1', 'Title', 'Body', { key: 'value' });

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(1);
      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0]).toEqual({
        to: 'ExponentPushToken[abc]',
        sound: 'default',
        title: 'Title',
        body: 'Body',
        data: { key: 'value' },
      });
    });

    it('should not send when user has no tokens', async () => {
      mockTokensForUser([]);

      await service.sendToUser('user-1', 'Title', 'Body');

      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it('should filter out invalid tokens and clean them up', async () => {
      mockTokensForUser(['valid-token', 'invalid-token']);
      // First token valid, second invalid
      mockIsExpoPushToken.mockImplementation(
        (t: string) => t === 'valid-token',
      );
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await service.sendToUser('user-1', 'Title', 'Body');

      // Should only send to valid token
      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].to).toBe('valid-token');
    });

    it('should remove stale DeviceNotRegistered tokens', async () => {
      mockTokensForUser(['token-1', 'token-2']);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: 'ok' },
        {
          status: 'error',
          details: { error: 'DeviceNotRegistered' },
          message: 'Device not registered',
        },
      ]);

      // Track bypassRls calls - first for getTokensForUser, second for removeStaleTokens
      let bypassCallCount = 0;
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        bypassCallCount++;
        if (bypassCallCount === 1) {
          // getTokensForUser
          const tx = {
            select: jest.fn().mockReturnValue({
              from: jest.fn().mockReturnValue({
                where: jest
                  .fn()
                  .mockResolvedValue([
                    { token: 'token-1' },
                    { token: 'token-2' },
                  ]),
              }),
            }),
          };
          return cb(tx);
        }
        // removeStaleTokens
        const tx = {
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        };
        return cb(tx);
      });

      await service.sendToUser('user-1', 'Title', 'Body');

      // Wait for fire-and-forget cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have called bypassRls a second time for cleanup
      expect(bypassCallCount).toBe(2);
    });

    it('should throw when Expo SDK fails', async () => {
      mockTokensForUser(['token-1']);
      mockSendPushNotificationsAsync.mockRejectedValue(
        new Error('Expo network error'),
      );

      await expect(
        service.sendToUser('user-1', 'Title', 'Body'),
      ).rejects.toThrow('Expo network error');
    });

    it('should throw when user is not in allowlist (non-production)', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'PUSH_NOTIFICATION_ALLOWLIST') return ['other-user'];
        return undefined;
      });

      await expect(
        service.sendToUser('user-1', 'Title', 'Body'),
      ).rejects.toThrow('not in allowlist');
    });
  });

  // =========================================================================
  // registerToken
  // =========================================================================

  describe('registerToken', () => {
    it('should upsert a push token for the current user', async () => {
      const mockToken = {
        id: 'pt-1',
        userId: 'user-123',
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              onConflictDoUpdate: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockToken]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.registerToken({
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      } as any);

      expect(result).toEqual(mockToken);
    });
  });

  // =========================================================================
  // unregisterToken
  // =========================================================================

  describe('unregisterToken', () => {
    it('should delete a push token for the current user', async () => {
      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        };
        return cb(tx);
      });

      const result = await service.unregisterToken('ExponentPushToken[abc]');
      expect(result).toEqual({ deleted: true });
    });
  });
});
