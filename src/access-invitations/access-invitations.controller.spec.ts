import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessInvitationsController } from './access-invitations.controller';
import { AccessInvitationsService } from './access-invitations.service';

describe('AccessInvitationsController', () => {
  let controller: AccessInvitationsController;

  const mockAccessInvitationsService = {
    getInvitationDetails: jest.fn(),
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn(),
    revokeOwnAccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 60000, limit: 20 },
        ]),
      ],
      controllers: [AccessInvitationsController],
      providers: [
        {
          provide: AccessInvitationsService,
          useValue: mockAccessInvitationsService,
        },
      ],
    }).compile();

    controller = module.get<AccessInvitationsController>(
      AccessInvitationsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
