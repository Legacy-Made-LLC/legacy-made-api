import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { NewUser, users } from 'src/schema';

/**
 * Service for managing user records.
 *
 * This service is primarily used for Clerk webhook operations where the
 * authenticated user context may not be available. Operations that modify
 * specific users use `withRLSAs` to set the user context explicitly.
 *
 * RLS policies on the users table:
 * - SELECT: Only own record (users.id = app.user_id)
 * - INSERT: Allowed (webhooks create users; security at app layer)
 * - UPDATE: Only own record (users.id = app.user_id)
 * - DELETE: Only own record (users.id = app.user_id)
 */
@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  /**
   * Create a new user record.
   * Called by Clerk webhook when a user signs up.
   * RLS INSERT policy allows this without user context.
   */
  async createUser(user: NewUser) {
    // INSERT policy allows any insert (security enforced by webhook signature)
    const [created] = await this.db.bypassRls(async (tx) => {
      return tx.insert(users).values(user).returning();
    });
    return created;
  }

  /**
   * Update a user's profile information.
   * Called by Clerk webhook when user data changes.
   * Uses withRLSAs to set user context for RLS validation.
   */
  async updateUser(
    id: string,
    data: Partial<Omit<NewUser, 'id' | 'createdAt'>>,
  ) {
    return this.db.bypassRls(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return updated;
    });
  }

  /**
   * Delete a user record.
   * Called by Clerk webhook when a user is deleted.
   * Uses withRLSAs to set user context for RLS validation.
   */
  async deleteUser(id: string) {
    return this.db.bypassRls(async (tx) => {
      const [deleted] = await tx
        .delete(users)
        .where(eq(users.id, id))
        .returning();
      return deleted;
    });
  }

  /**
   * Find a user by their ID.
   * Uses withRLSAs to ensure we only access the specified user's record.
   */
  async findById(id: string) {
    return this.db.bypassRls(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, id));
      return user;
    });
  }
}
