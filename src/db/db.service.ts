import { neon } from '@neondatabase/serverless';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { ApiConfigService } from 'src/config/api-config.service';

@Injectable()
export class DbService implements OnModuleInit {
  public readonly drizzle: ReturnType<typeof drizzle>;

  constructor(private readonly config: ApiConfigService) {
    const dbUrl = this.config.get('DATABASE_URL');
    const sql = neon(dbUrl);
    this.drizzle = drizzle(sql);
  }

  async onModuleInit() {
    await migrate(this.drizzle, { migrationsFolder: 'migrations' });
  }
}
