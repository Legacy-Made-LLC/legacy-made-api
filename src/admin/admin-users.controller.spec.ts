import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { AdminUsersController } from './admin-users.controller';
import { SystemAdminGuard } from './system-admin.guard';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let mockDb: { bypassRls: jest.Mock };

  const makeMockTx = (rows: unknown[]) => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  });

  beforeEach(async () => {
    mockDb = { bypassRls: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: DbService, useValue: mockDb }],
    })
      .overrideGuard(SystemAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
  });

  it('returns the matching user (case-insensitive)', async () => {
    mockDb.bypassRls.mockImplementation((cb) =>
      cb(
        makeMockTx([
          { id: 'user_1', email: 'jane@example.com', firstName: 'Jane' },
        ]),
      ),
    );

    const result = await controller.byEmail('JANE@example.com');

    expect(result.id).toBe('user_1');
  });

  it('404s when no user matches', async () => {
    mockDb.bypassRls.mockImplementation((cb) => cb(makeMockTx([])));

    await expect(controller.byEmail('missing@example.com')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects when email is missing or too short', async () => {
    await expect(controller.byEmail()).rejects.toThrow(BadRequestException);
    await expect(controller.byEmail('a')).rejects.toThrow(BadRequestException);
  });
});
