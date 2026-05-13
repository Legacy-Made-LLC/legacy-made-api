import { Controller, Get, UseGuards } from '@nestjs/common';
import { SystemAdminGuard } from './system-admin.guard';

/**
 * Admin endpoint surface. All routes require the `is_system_admin` flag
 * via {@link SystemAdminGuard}. The CRUD endpoints for master subscriptions
 * land in #23; this controller currently exposes a health/smoke endpoint
 * so the admin CLI (#24) can sanity-check connectivity and credentials.
 */
@Controller('admin')
@UseGuards(SystemAdminGuard)
export class AdminController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}
