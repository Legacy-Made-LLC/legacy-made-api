import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemAdminGuard } from './system-admin.guard';

@Module({
  providers: [AdminService, SystemAdminGuard],
  controllers: [AdminController],
  exports: [AdminService, SystemAdminGuard],
})
export class AdminModule {}
