import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { EmailService } from '../email/email.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { KmsService } from './kms.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

  const mockClsService = {
    requireUserId: jest.fn().mockReturnValue('user-123'),
    get: jest.fn(),
    getIpAddress: jest.fn(),
    getUserAgent: jest.fn(),
  };

  const mockKmsService = {
    getPublicKey: jest.fn(),
    decryptDek: jest.fn(),
  };

  const mockEmailService = {
    sendRecoveryNotification: jest.fn(),
    sendEscrowEnabledNotification: jest.fn(),
    sendEscrowRevokedNotification: jest.fn(),
  };

  const mockPushNotificationsService = {
    sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
        { provide: KmsService, useValue: mockKmsService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: PushNotificationsService,
          useValue: mockPushNotificationsService,
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // deactivateKey
  // =========================================================================

  describe('deactivateKey', () => {
    it('should deactivate a device key and delete associated DEKs', async () => {
      const mockKey = {
        id: 'key-1',
        userId: 'user-123',
        keyVersion: 2,
        keyType: 'device',
        isActive: true,
      };
      const updatedKey = {
        ...mockKey,
        isActive: false,
        deactivatedAt: new Date(),
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([mockKey]),
            }),
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([updatedKey]),
              }),
            }),
          }),
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        };
        return cb(tx);
      });

      const result = await service.deactivateKey(2);
      expect(result).toEqual(updatedKey);
    });

    it('should throw NotFoundException if key not found', async () => {
      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(service.deactivateKey(99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-device key', async () => {
      const recoveryKey = {
        id: 'key-1',
        userId: 'user-123',
        keyVersion: 1,
        keyType: 'recovery',
        isActive: true,
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([recoveryKey]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(service.deactivateKey(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if already deactivated', async () => {
      const inactiveKey = {
        id: 'key-1',
        userId: 'user-123',
        keyVersion: 2,
        keyType: 'device',
        isActive: false,
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([inactiveKey]),
            }),
          }),
        };
        return cb(tx);
      });

      await expect(service.deactivateKey(2)).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // getMyKeys with active filter
  // =========================================================================

  describe('getMyKeys', () => {
    it('should return all keys when no filter', async () => {
      const allKeys = [
        { keyVersion: 1, isActive: true },
        { keyVersion: 2, isActive: false },
      ];

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(allKeys),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getMyKeys();
      expect(result).toEqual(allKeys);
    });

    it('should filter by active when specified', async () => {
      const activeKeys = [{ keyVersion: 1, isActive: true }];

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(activeKeys),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getMyKeys({ active: true });
      expect(result).toEqual(activeKeys);
    });
  });

  // =========================================================================
  // getUserKeys with includeInactive
  // =========================================================================

  describe('getUserKeys', () => {
    it('should return only active keys by default', async () => {
      const activeKeys = [{ keyVersion: 1, isActive: true }];

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(activeKeys),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getUserKeys('other-user');
      expect(result).toEqual(activeKeys);
    });

    it('should return all keys when includeInactive is true', async () => {
      const allKeys = [
        { keyVersion: 1, isActive: true },
        { keyVersion: 2, isActive: false },
      ];

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(allKeys),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getUserKeys('other-user', {
        includeInactive: true,
      });
      expect(result).toEqual(allKeys);
    });
  });

  // =========================================================================
  // getUserKeysByEmail
  // =========================================================================

  describe('getUserKeysByEmail', () => {
    it('should return found: false when no keys exist', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getUserKeysByEmail('nobody@test.com');
      expect(result).toEqual({ found: false });
    });

    it('should return userId and keys without PII when user found', async () => {
      const rows = [
        {
          publicKey: 'pk1',
          keyVersion: 2,
          keyType: 'device',
          isActive: true,
          userId: 'user-456',
        },
        {
          publicKey: 'pk2',
          keyVersion: 1,
          keyType: 'recovery',
          isActive: true,
          userId: 'user-456',
        },
      ];

      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.getUserKeysByEmail('jane@test.com');
      expect(result).toEqual({
        found: true,
        userId: 'user-456',
        keys: [
          {
            publicKey: 'pk1',
            keyVersion: 2,
            keyType: 'device',
            isActive: true,
          },
          {
            publicKey: 'pk2',
            keyVersion: 1,
            keyType: 'recovery',
            isActive: true,
          },
        ],
      });

      // Should not contain firstName, lastName, or deviceLabel
      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('lastName');
      if ('keys' in result) {
        for (const key of result.keys) {
          expect(key).not.toHaveProperty('deviceLabel');
        }
      }
    });
  });

  // =========================================================================
  // getEscrowPublicKey
  // =========================================================================

  describe('getEscrowPublicKey', () => {
    it('should return the KMS public key', async () => {
      mockKmsService.getPublicKey.mockResolvedValue('base64-public-key');

      const result = await service.getEscrowPublicKey();

      expect(result).toEqual({ publicKey: 'base64-public-key' });
      expect(mockKmsService.getPublicKey).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // enableEscrow
  // =========================================================================

  describe('enableEscrow', () => {
    it('should store client-encrypted DEK directly without server-side encryption', async () => {
      const mockDek = {
        id: 'dek-1',
        planId: 'plan-123',
        ownerId: 'user-123',
        recipientId: 'user-123',
        dekType: 'escrow',
        encryptedDek: 'client-rsa-oaep-ciphertext',
        keyVersion: 0,
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              onConflictDoUpdate: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockDek]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      // Mock bypassRls for the email notification
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest
                .fn()
                .mockResolvedValue([
                  { email: 'test@test.com', firstName: 'Test' },
                ]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.enableEscrow({
        planId: 'plan-123',
        encryptedDek: 'client-rsa-oaep-ciphertext',
      } as any);

      expect(result).toEqual({ id: 'dek-1', enabled: true });
      // Server should NOT call KMS encrypt — client already encrypted
      expect(mockKmsService.getPublicKey).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // storeEncryptedDek — push notification side effect
  // =========================================================================

  describe('storeEncryptedDek', () => {
    it('should send push notification when storing a contact DEK for another user', async () => {
      const mockDek = {
        id: 'dek-1',
        planId: 'plan-1',
        ownerId: 'user-123',
        recipientId: 'other-user',
        dekType: 'contact',
        encryptedDek: 'enc',
        keyVersion: 1,
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              onConflictDoUpdate: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockDek]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      // bypassRls for the notification owner lookup
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest
                .fn()
                .mockResolvedValue([{ firstName: 'Test', lastName: 'User' }]),
            }),
          }),
        };
        return cb(tx);
      });

      await service.storeEncryptedDek({
        planId: 'plan-1',
        recipientId: 'other-user',
        dekType: 'contact',
        encryptedDek: 'enc',
        keyVersion: 1,
      } as any);

      // Wait for fire-and-forget notification
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPushNotificationsService.sendToUser).toHaveBeenCalledWith(
        'other-user',
        'Plan Access Granted',
        expect.stringContaining('plan'),
        expect.objectContaining({ type: 'dek_shared', planId: 'plan-1' }),
      );
    });

    it('should not send push notification for own device DEK', async () => {
      const mockDek = {
        id: 'dek-1',
        planId: 'plan-1',
        ownerId: 'user-123',
        recipientId: 'user-123',
        dekType: 'device',
        encryptedDek: 'enc',
        keyVersion: 1,
      };

      mockDbService.rls.mockImplementation(async (cb) => {
        const tx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              onConflictDoUpdate: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockDek]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      await service.storeEncryptedDek({
        planId: 'plan-1',
        recipientId: 'user-123',
        dekType: 'device',
        encryptedDek: 'enc',
        keyVersion: 1,
      } as any);

      expect(mockPushNotificationsService.sendToUser).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // deleteContactDekCopy
  // =========================================================================

  describe('deleteContactDekCopy', () => {
    it('should return true when DEK copies are deleted', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ userId: 'owner-1' }]),
            }),
          }),
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: 'dek-1' }]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.deleteContactDekCopy(
        'plan-1',
        'recipient-1',
      );
      expect(result).toBe(true);
    });

    it('should return false when plan not found', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.deleteContactDekCopy(
        'plan-1',
        'recipient-1',
      );
      expect(result).toBe(false);
    });

    it('should return false when no DEK copies exist', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ userId: 'owner-1' }]),
            }),
          }),
          delete: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.deleteContactDekCopy(
        'plan-1',
        'recipient-1',
      );
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // resolveUserIdByEmail
  // =========================================================================

  describe('resolveUserIdByEmail', () => {
    it('should return userId when user found', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ id: 'user-456' }]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.resolveUserIdByEmail('jane@test.com');
      expect(result).toBe('user-456');
    });

    it('should return null when user not found', async () => {
      mockDbService.bypassRls.mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.resolveUserIdByEmail('nobody@test.com');
      expect(result).toBeNull();
    });
  });
});
