import { Test, TestingModule } from '@nestjs/testing';
import { ApiClsService } from '../lib/api-cls.service';
import { MasterSubscriptionInvitationsController } from './master-subscription-invitations.controller';
import { MasterSubscriptionsService } from './master-subscriptions.service';

describe('MasterSubscriptionInvitationsController', () => {
  let controller: MasterSubscriptionInvitationsController;
  let service: jest.Mocked<MasterSubscriptionsService>;
  let cls: { requireUserId: jest.Mock };

  beforeEach(async () => {
    service = {
      previewInvite: jest.fn(),
      acceptInvite: jest.fn(),
    } as unknown as jest.Mocked<MasterSubscriptionsService>;
    cls = { requireUserId: jest.fn().mockReturnValue('user_jane') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MasterSubscriptionInvitationsController],
      providers: [
        { provide: MasterSubscriptionsService, useValue: service },
        { provide: ApiClsService, useValue: cls },
      ],
    }).compile();

    controller = module.get<MasterSubscriptionInvitationsController>(
      MasterSubscriptionInvitationsController,
    );
  });

  it('preview delegates to service.previewInvite', async () => {
    service.previewInvite.mockResolvedValue({
      providerName: 'Acme',
      ownerName: 'Pat Owner',
      invitedEmail: 'jane@example.com',
      status: 'pending_invite',
      masterSubscriptionStatus: 'active',
    });

    const result = await controller.preview('some.token');

    expect(service.previewInvite).toHaveBeenCalledWith('some.token');
    expect(result.providerName).toBe('Acme');
  });

  it('accept delegates with the authenticated user id (no email check)', async () => {
    service.acceptInvite.mockResolvedValue({
      member: { id: 'member_1', status: 'active' },
      masterSubscription: { id: 'sub_1' },
    } as never);

    await controller.accept('some.token');

    expect(service.acceptInvite).toHaveBeenCalledWith(
      'some.token',
      'user_jane',
    );
  });
});
