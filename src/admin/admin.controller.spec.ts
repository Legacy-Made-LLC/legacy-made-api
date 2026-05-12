import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemAdminGuard } from './system-admin.guard';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: {} },
        { provide: SystemAdminGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('ping returns { ok: true }', () => {
    expect(controller.ping()).toEqual({ ok: true });
  });
});
