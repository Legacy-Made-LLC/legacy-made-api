import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApiConfigService } from '../config/api-config.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { InvitationTokenService } from './invitation-token.service';
import { TrustedContactsService } from './trusted-contacts.service';

describe('TrustedContactsService', () => {
  let service: TrustedContactsService;

  const mockDbService = {
    rls: jest.fn(),
    bypassRls: jest.fn(),
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustedContactsService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: InvitationTokenService,
          useValue: mockInvitationTokenService,
        },
        {
          provide: ActivityLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TrustedContactsService>(TrustedContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
