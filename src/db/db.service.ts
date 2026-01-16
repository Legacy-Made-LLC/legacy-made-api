import { Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ApiConfigService } from 'src/config/api-config.service';

@Injectable()
export class DbService {
  public readonly drizzle: ReturnType<typeof drizzle>;

  constructor(private readonly config: ApiConfigService) {
    const dbUrl = this.config.get('DATABASE_URL');
    this.drizzle = drizzle(dbUrl);
  }
}
