import { timingSafeEqual } from 'crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { BypassJwtAuth } from 'src/auth/auth.guard';
import { ApiConfigService } from 'src/config/api-config.service';
import { RevenuecatWebhookDto } from './dto/webhook.dto';
import { RevenuecatService, type EventOutcome } from './revenuecat.service';

@Controller('webhooks')
export class RevenuecatController {
  private readonly logger = new Logger(RevenuecatController.name);

  constructor(
    private readonly rc: RevenuecatService,
    private readonly config: ApiConfigService,
  ) {}

  @BypassJwtAuth()
  @Post('revenuecat')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: RevenuecatWebhookDto,
  ) {
    const startedAt = Date.now();
    const expected = this.config.get('REVENUECAT_WEBHOOK_AUTH_HEADER');

    if (!authHeader || !safeEqual(authHeader, expected)) {
      this.logger.error({
        msg: 'revenuecat_webhook',
        outcome: 'invalid_signature',
        durationMs: Date.now() - startedAt,
      });
      throw new UnauthorizedException('Invalid webhook authorization');
    }

    const event = dto.event;

    // RC delivers at-least-once with up to 5 retries over ~2.5 hours. The
    // dedupe log short-circuits retries so handlers don't re-apply state.
    // If a handler below throws, we 5xx and the row is NOT recorded, so RC
    // retries from scratch on the next delivery.
    if (await this.rc.isEventProcessed(event.id)) {
      this.logger.log({
        msg: 'revenuecat_webhook',
        eventId: event.id,
        eventType: event.type,
        appUserId: event.app_user_id,
        outcome: 'deduped',
        durationMs: Date.now() - startedAt,
      });
      return { received: true, deduped: true };
    }

    let outcome: EventOutcome;
    try {
      outcome = await this.rc.handleEvent(event);
    } catch (err) {
      this.logger.error(
        {
          msg: 'revenuecat_webhook',
          eventId: event.id,
          eventType: event.type,
          appUserId: event.app_user_id,
          outcome: 'error',
          durationMs: Date.now() - startedAt,
        },
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }

    await this.rc.recordProcessedEvent(event.id, event.type, outcome);

    const logPayload = {
      msg: 'revenuecat_webhook',
      eventId: event.id,
      eventType: event.type,
      appUserId: event.app_user_id,
      outcome,
      durationMs: Date.now() - startedAt,
    };
    if (outcome === 'skipped') {
      // Raise visibility on event types we're ignoring; filter `warn` in the
      // log dashboard to see if RC introduced a type we should be handling.
      // Sentry is not wired into this repo yet — see follow-up #21.
      this.logger.warn(logPayload);
    } else {
      this.logger.log(logPayload);
    }

    return { received: true };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
