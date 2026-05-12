import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { SystemAdminGuard } from './system-admin.guard';

describe('SystemAdminGuard', () => {
  let guard: SystemAdminGuard;
  let mockAdminService: { isCurrentUserSystemAdmin: jest.Mock };

  beforeEach(async () => {
    mockAdminService = { isCurrentUserSystemAdmin: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemAdminGuard,
        { provide: AdminService, useValue: mockAdminService },
      ],
    }).compile();

    guard = module.get<SystemAdminGuard>(SystemAdminGuard);
  });

  it('allows access when user is a system admin', async () => {
    mockAdminService.isCurrentUserSystemAdmin.mockResolvedValue(true);

    await expect(guard.canActivate()).resolves.toBe(true);
  });

  it('throws ForbiddenException when user is not a system admin', async () => {
    mockAdminService.isCurrentUserSystemAdmin.mockResolvedValue(false);

    await expect(guard.canActivate()).rejects.toThrow(ForbiddenException);
  });

  it('propagates errors from the admin service (e.g., missing CLS userId)', async () => {
    mockAdminService.isCurrentUserSystemAdmin.mockRejectedValue(
      new Error('No user ID in context'),
    );

    await expect(guard.canActivate()).rejects.toThrow('No user ID in context');
  });
});
