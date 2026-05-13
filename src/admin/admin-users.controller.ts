import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { users } from '../schema';
import { SystemAdminGuard } from './system-admin.guard';

/**
 * System-admin user-lookup endpoints. Currently a single read endpoint
 * used by the admin CLI (#24) to resolve owner emails to user IDs when
 * creating master subscriptions.
 */
@Controller('admin/users')
@UseGuards(SystemAdminGuard)
export class AdminUsersController {
  constructor(private readonly db: DbService) {}

  /**
   * Look up a user by primary email. Case-insensitive. Returns 404 when
   * no match — admins should sync the user via Clerk first.
   */
  @Get('by-email')
  async byEmail(@Query('email') email?: string) {
    if (!email || email.length < 3) {
      throw new BadRequestException('email query parameter is required');
    }
    const normalized = email.trim().toLowerCase();

    return this.db.bypassRls(async (tx) => {
      const [row] = await tx
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalized}`);
      if (!row) {
        throw new NotFoundException(`No user found with email: ${email}`);
      }
      return row;
    });
  }
}
