import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockDbService: { rls: jest.Mock };
  let mockClsService: { requireUserId: jest.Mock };

  const buildTxReturning = (flag: boolean | null) => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(flag === null ? [] : [{ flag }]),
  });

  beforeEach(async () => {
    mockDbService = { rls: jest.fn() };
    mockClsService = {
      requireUserId: jest.fn().mockReturnValue('user_abc'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('returns true when users.is_system_admin = true', async () => {
    mockDbService.rls.mockImplementation((cb) => cb(buildTxReturning(true)));

    await expect(service.isCurrentUserSystemAdmin()).resolves.toBe(true);
  });

  it('returns false when users.is_system_admin = false', async () => {
    mockDbService.rls.mockImplementation((cb) => cb(buildTxReturning(false)));

    await expect(service.isCurrentUserSystemAdmin()).resolves.toBe(false);
  });

  it('returns false when the user row is missing', async () => {
    mockDbService.rls.mockImplementation((cb) => cb(buildTxReturning(null)));

    await expect(service.isCurrentUserSystemAdmin()).resolves.toBe(false);
  });

  it('throws when no user is in CLS context', async () => {
    mockClsService.requireUserId.mockImplementation(() => {
      throw new Error('No user ID in context');
    });

    await expect(service.isCurrentUserSystemAdmin()).rejects.toThrow(
      'No user ID in context',
    );
  });
});
