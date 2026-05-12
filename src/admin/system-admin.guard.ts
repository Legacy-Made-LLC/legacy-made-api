import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * Guards endpoints that require the `is_system_admin` flag on `users`.
 * Pair with `@UseGuards(SystemAdminGuard)` (or apply at the controller
 * level). Returns 403 for non-admin authenticated users; relies on
 * `AuthGuard` having already populated CLS with the userId.
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  constructor(private readonly adminService: AdminService) {}

  async canActivate(): Promise<boolean> {
    const isAdmin = await this.adminService.isCurrentUserSystemAdmin();
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
