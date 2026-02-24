import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { InvitationTokenService } from '../trusted-contacts/invitation-token.service';
import { AccessInvitationsService } from './access-invitations.service';

describe('AccessInvitationsService', () => {
  let service: AccessInvitationsService;

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
        AccessInvitationsService,
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

    service = module.get<AccessInvitationsService>(AccessInvitationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
