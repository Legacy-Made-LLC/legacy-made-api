import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lt } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { processedRevenuecatEvents } from 'src/schema';

// 90 days. RC retries deliveries for ~2.5h; anything older than that is
// well past the dedupe window and only consumes table space.
export const PROCESSED_EVENTS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProcessedEventsPruneService {
  private readonly logger = new Logger(ProcessedEventsPruneService.name);

  constructor(private readonly db: DbService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldEvents(): Promise<void> {
    try {
      const deleted = await this.deleteOlderThan(
        new Date(Date.now() - PROCESSED_EVENTS_RETENTION_MS),
      );
      this.logger.log({
        msg: 'processed_revenuecat_events_pruned',
        deleted,
      });
    } catch (err) {
      this.logger.error(
        {
          msg: 'processed_revenuecat_events_prune_failed',
        },
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    return this.db.bypassRls(async (tx) => {
      const rows = await tx
        .delete(processedRevenuecatEvents)
        .where(lt(processedRevenuecatEvents.receivedAt, cutoff))
        .returning({ eventId: processedRevenuecatEvents.eventId });
      return rows.length;
    });
  }
}
