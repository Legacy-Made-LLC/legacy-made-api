import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { DbService } from 'src/db/db.service';
import { entries } from 'src/schema';

@Injectable()
export class DbHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly db: DbService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.db.drizzle.select().from(entries).limit(1);
    } catch (error) {
      return indicator.down(error);
    }

    return indicator.up();
  }
}
