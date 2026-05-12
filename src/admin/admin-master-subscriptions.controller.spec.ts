import { Test, TestingModule } from '@nestjs/testing';
import { ApiClsService } from '../lib/api-cls.service';
import { MasterSubscriptionsService } from '../master-subscriptions/master-subscriptions.service';
import { AdminMasterSubscriptionsController } from './admin-master-subscriptions.controller';
import { SystemAdminGuard } from './system-admin.guard';

describe('AdminMasterSubscriptionsController', () => {
  let controller: AdminMasterSubscriptionsController;
  let service: jest.Mocked<MasterSubscriptionsService>;
  let cls: { requireUserId: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      listMembers: jest.fn(),
      inviteMember: jest.fn(),
    } as unknown as jest.Mocked<MasterSubscriptionsService>;
    cls = { requireUserId: jest.fn().mockReturnValue('user_admin') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMasterSubscriptionsController],
      providers: [
        { provide: MasterSubscriptionsService, useValue: service },
        { provide: ApiClsService, useValue: cls },
      ],
    })
      .overrideGuard(SystemAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminMasterSubscriptionsController>(
      AdminMasterSubscriptionsController,
    );
  });

  it('create delegates to service with actor user id from CLS', async () => {
    const dto = {
      ownerUserId: 'u1',
      displayName: 'Acme',
      seatLimit: 25,
      tier: 'individual' as const,
      ownerConsumesSeat: true,
    };
    service.create.mockResolvedValue({ id: 'sub_1' } as never);

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto, 'user_admin');
    expect(result).toEqual({ id: 'sub_1' });
  });

  it('list delegates to service', async () => {
    service.list.mockResolvedValue([{ id: 'sub_1' }] as never);
    await expect(controller.list()).resolves.toEqual([{ id: 'sub_1' }]);
  });

  it('findOne delegates to service', async () => {
    service.getById.mockResolvedValue({ id: 'sub_1' } as never);
    await expect(controller.findOne('sub_1')).resolves.toEqual({ id: 'sub_1' });
    expect(service.getById).toHaveBeenCalledWith('sub_1');
  });

  it('update delegates with actor user id', async () => {
    service.update.mockResolvedValue({
      id: 'sub_1',
      status: 'suspended',
    } as never);
    await controller.update('sub_1', { status: 'suspended' });
    expect(service.update).toHaveBeenCalledWith(
      'sub_1',
      { status: 'suspended' },
      'user_admin',
    );
  });

  it('listMembers delegates to service', async () => {
    service.listMembers.mockResolvedValue([{ id: 'member_1' }] as never);
    await expect(controller.listMembers('sub_1')).resolves.toEqual([
      { id: 'member_1' },
    ]);
  });

  it('invite delegates to service.inviteMember with actor user id', async () => {
    service.inviteMember.mockResolvedValue({
      token: 't',
      acceptanceUrl: 'https://app/team-invitation?token=t',
      memberId: 'member_new',
      invitedEmail: 'jane@example.com',
    });

    const result = await controller.invite('sub_1', {
      email: 'jane@example.com',
    });

    expect(service.inviteMember).toHaveBeenCalledWith(
      'sub_1',
      'jane@example.com',
      'user_admin',
    );
    expect(result.acceptanceUrl).toContain('team-invitation');
  });

  it('invite rejects when email is missing', () => {
    expect(() => controller.invite('sub_1', {})).toThrow(/email is required/);
  });
});
