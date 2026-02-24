import { Injectable, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ApiConfigService } from 'src/config/api-config.service';
import { ApiClsService } from 'src/lib/api-cls.service';

export type DrizzleInstance = ReturnType<typeof drizzle>;
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleInstance['transaction']>[0]
>[0];

@Injectable()
export class DbService implements OnModuleInit {
  public readonly drizzle: DrizzleInstance;

  constructor(
    private readonly config: ApiConfigService,
    private readonly cls: ApiClsService,
  ) {
    const dbUrl = this.config.get('DATABASE_URL_APP');
    this.drizzle = drizzle(dbUrl);
  }

  async onModuleInit() {
    const migrationsDbUrl = this.config.get('DATABASE_URL_MIGRATIONS');
    await migrate(drizzle(migrationsDbUrl), { migrationsFolder: 'migrations' });
  }

  /**
   * Execute database operations with RLS context.
   *
   * This wraps the callback in a transaction and sets the `app.user_id`
   * session variable so that RLS policies can identify the current user.
   *
   * @param callback - Function receiving a transaction-scoped drizzle instance
   * @returns The result of the callback
   * @throws UnauthorizedException if no user is in the current context
   *
   * @example
   * ```ts
   * const plans = await this.db.withRLS(async (tx) => {
   *   return tx.select().from(plans);
   * });
   * ```
   */
  public readonly rls: DrizzleInstance['transaction'] = async (
    callback,
    ...rest
  ) => {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new Error(
        'No user ID in context. withRLS() must be called within an authenticated request.',
      );
    }

    return this.drizzle.transaction(
      async (tx) => {
        // Set the user ID for RLS policies
        // Using parameterized query to prevent SQL injection
        await tx.execute(
          sql`SELECT set_config('app.user_id', ${userId}, true)`,
        );
        return callback(tx);
      },
      ...rest,
    );
  };

  /**
   * Execute database operations with a specific user ID for RLS.
   *
   * Useful for background jobs, webhooks, or admin operations where
   * the user context isn't set via the normal auth flow.
   *
   * @param userId - The user ID to set for RLS policies
   * @param callback - Function receiving a transaction-scoped drizzle instance
   * @returns The result of the callback
   */
  public readonly bypassRls: DrizzleInstance['transaction'] = async (
    callback,
    ...rest
  ) => {
    return this.drizzle.transaction(
      async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.bypass_rls_status', 'on', true)`,
        );
        return callback(tx);
      },
      ...rest,
    );
  };
}
