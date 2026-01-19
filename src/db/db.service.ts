import { neon } from '@neondatabase/serverless';
import { Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/neon-http';
import { ApiConfigService } from 'src/config/api-config.service';

@Injectable()
export class DbService {
  public readonly drizzle: ReturnType<typeof drizzle>;

  constructor(private readonly config: ApiConfigService) {
    const dbUrl = this.config.get('DATABASE_URL');
    const sql = neon(dbUrl);
    this.drizzle = drizzle(sql);
  }
}
