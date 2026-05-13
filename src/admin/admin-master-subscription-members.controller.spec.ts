import { Test, TestingModule } from '@nestjs/testing';
import { ApiClsService } from '../lib/api-cls.service';
import { MasterSubscriptionsService } from '../master-subscriptions/master-subscriptions.service';
import { AdminMasterSubscriptionMembersController } from './admin-master-subscription-members.controller';
import { SystemAdminGuard } from './system-admin.guard';

describe('AdminMasterSubscriptionMembersController', () => {
  let controller: AdminMasterSubscriptionMembersController;
  let service: jest.Mocked<MasterSubscriptionsService>;
  let cls: { requireUserId: jest.Mock };

  beforeEach(async () => {
    service = {
      removeMember: jest.fn(),
    } as unknown as jest.Mocked<MasterSubscriptionsService>;
    cls = { requireUserId: jest.fn().mockReturnValue('user_admin') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMasterSubscriptionMembersController],
      providers: [
        { provide: MasterSubscriptionsService, useValue: service },
        { provide: ApiClsService, useValue: cls },
      ],
    })
      .overrideGuard(SystemAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminMasterSubscriptionMembersController>(
      AdminMasterSubscriptionMembersController,
    );
  });

  it('remove delegates to service with actor user id from CLS', async () => {
    service.removeMember.mockResolvedValue({
      id: 'member_1',
      status: 'removed',
    } as never);

    const result = await controller.remove('member_1');

    expect(service.removeMember).toHaveBeenCalledWith('member_1', 'user_admin');
    expect(result).toEqual({ id: 'member_1', status: 'removed' });
  });
});
