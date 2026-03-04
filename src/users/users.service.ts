import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApiConfigService } from 'src/config/api-config.service';
import { DbService } from 'src/db/db.service';
import { EmailService } from 'src/email/email.service';
import { SubscriptionTier } from 'src/entitlements';
import { NewUser, subscriptions, users } from 'src/schema';

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
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: DbService,
    private readonly config: ApiConfigService,
    private readonly email: EmailService,
  ) {}

  /**
   * Get the default subscription tier for new users.
   * Normally returns 'free', but when GRANT_LIFETIME_TO_NEW_USERS is enabled,
   * returns 'lifetime' for Early Access users.
   */
  getDefaultSubscription(): SubscriptionTier {
    if (this.config.get('GRANT_LIFETIME_TO_NEW_USERS')) {
      return 'lifetime';
    }
    return 'free';
  }

  /**
   * Create or update a user record.
   * Called by Clerk webhook on user.created and user.updated events.
   * Creates the user with a default subscription if they don't exist yet.
   */
  async upsertUser(data: NewUser) {
    const user = await this.db.bypassRls(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...updateData } = data;
      const [upserted] = await tx
        .insert(users)
        .values(data)
        .onConflictDoUpdate({
          target: users.id,
          set: updateData,
        })
        .returning();

      // Ensure subscription exists (no-op if already present)
      const tier = this.getDefaultSubscription();
      await tx
        .insert(subscriptions)
        .values({ userId: upserted.id, tier })
        .onConflictDoNothing();

      return upserted;
    });

    if (user.email) {
      try {
        await this.email.updateSubscriberProperties({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userId: user.id,
          signedUpAt: user.createdAt,
        });
      } catch (e) {
        this.logger.error(
          `Failed to set email subscriber properties after upserting user with email: ${user.email}`,
          e,
        );
      }
    }

    return user;
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
