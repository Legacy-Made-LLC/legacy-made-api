import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApiConfigService } from '../config/api-config.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { InvitationTokenService } from './invitation-token.service';
import { TrustedContactsService } from './trusted-contacts.service';

describe('TrustedContactsService', () => {
  let service: TrustedContactsService;
  let mockDbService: { rls: jest.Mock; bypassRls: jest.Mock };

  const mockEmailService = {
    sendInvitation: jest.fn(),
    sendAccessAccepted: jest.fn(),
    sendAccessDeclined: jest.fn(),
    sendAccessRevokedByContact: jest.fn(),
  };

  const mockInvitationTokenService = {
    generateToken: jest.fn(() => 'mock-token'),
    verifyToken: jest.fn(),
  };

  const mockEncryptionService = {
    deleteContactDekCopy: jest.fn(),
  };

  const mockActivityLogService = {
    log: jest.fn(),
  };

  const mockPushNotificationsService = {
    sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    mockDbService = {
      rls: jest.fn(),
      bypassRls: jest.fn().mockImplementation(async (cb) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
        return cb(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustedContactsService,
        { provide: DbService, useValue: mockDbService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: InvitationTokenService,
          useValue: mockInvitationTokenService,
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ActivityLogService, useValue: mockActivityLogService },
        {
          provide: PushNotificationsService,
          useValue: mockPushNotificationsService,
        },
        {
          provide: ApiConfigService,
          useValue: { get: jest.fn(() => 'https://app.test.com') },
        },
      ],
    }).compile();

    service = module.get<TrustedContactsService>(TrustedContactsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const basePlan = {
      ownerId: 'owner-1',
      ownerFirstName: 'John',
      ownerLastName: 'Doe',
    };

    const baseContact = {
      id: 'tc-1',
      planId: 'plan-1',
      email: 'contact@test.com',
      firstName: 'Jane',
      lastName: 'Smith',
      accessLevel: 'full_view',
      accessTiming: 'immediate',
      accessStatus: 'pending',
    };

    function setupCreateMock(opts?: { existing?: boolean }) {
      mockDbService.rls.mockImplementation(async (cb) => {
        const insertWhere = jest
          .fn()
          .mockResolvedValue(
            opts?.existing
              ? [{ ...baseContact, accessStatus: 'revoked_by_owner' }]
              : [],
          );

        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([basePlan]),
              }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([baseContact]),
              onConflictDoUpdate: jest.fn().mockReturnValue({
                set: jest.fn(),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([baseContact]),
              }),
            }),
          }),
        };

        // Override select for the first call (checking existing) vs second (plan info)
        let selectCallCount = 0;
        tx.select = jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: jest.fn().mockReturnValue({
                where: insertWhere,
              }),
            };
          }
          return {
            from: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([basePlan]),
              }),
            }),
          };
        });

        return cb(tx);
      });
    }

    it('should create a trusted contact with deks array', async () => {
      setupCreateMock();

      const dto = {
        email: 'contact@test.com',
        firstName: 'Jane',
        lastName: 'Smith',
        accessLevel: 'full_view' as const,
        accessTiming: 'immediate' as const,
        deks: [
          { recipientId: 'user-456', encryptedDek: 'enc1', keyVersion: 1 },
          { recipientId: 'user-456', encryptedDek: 'enc2', keyVersion: 2 },
        ],
      };

      const result = await service.create('plan-1', dto);
      expect(result).toBeDefined();
      expect(result.email).toBe('contact@test.com');
    });

    it('should create a trusted contact with no deks', async () => {
      setupCreateMock();

      const dto = {
        email: 'contact@test.com',
        firstName: 'Jane',
        lastName: 'Smith',
        accessLevel: 'full_view' as const,
        accessTiming: 'immediate' as const,
      };

      const result = await service.create('plan-1', dto);
      expect(result).toBeDefined();
      expect(result.email).toBe('contact@test.com');
    });
  });
});
