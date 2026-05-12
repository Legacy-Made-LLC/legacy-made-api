import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { users } from '../schema';

/**
 * Application-layer admin helpers. Pairs with {@link SystemAdminGuard}
 * to gate the `/admin/**` endpoints. The `users.is_system_admin` flag is
 * set manually via SQL — there is no self-service path to grant it.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  /**
   * Whether the currently-authenticated user has the is_system_admin flag.
   * Reads via the RLS-scoped tx; users can always read their own row, so
   * this resolves cleanly without bypassRls.
   */
  async isCurrentUserSystemAdmin(): Promise<boolean> {
    const userId = this.cls.requireUserId();
    return this.db.rls(async (tx) => {
      const [row] = await tx
        .select({ flag: users.isSystemAdmin })
        .from(users)
        .where(eq(users.id, userId));
      return row?.flag ?? false;
    });
  }
}
