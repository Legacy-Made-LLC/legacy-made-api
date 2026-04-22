import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiClsService } from 'src/lib/api-cls.service';
import { RevenuecatService } from 'src/revenuecat/revenuecat.service';
import { EntitlementsService } from './entitlements.service';
import { EntitlementInfo } from './entitlements.types';

@Controller('entitlements')
export class EntitlementsController {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly revenuecatService: RevenuecatService,
    private readonly cls: ApiClsService,
  ) {}

  @Get()
  getEntitlements(): Promise<EntitlementInfo> {
    return this.entitlementsService.getEntitlementInfo();
  }

  /**
   * Force a server-side reconcile of the caller's subscription against
   * RC's REST API view, then return the freshly recomputed
   * EntitlementInfo. Self-healing path for when our DB has drifted from
   * RC (missed webhook, dev DB tampering). FE calls this on Restore
   * Purchases and from the activating screen's manual refresh.
   *
   * Throttled because each call hits RC's REST API. Limits target the
   * realistic FE flow (one call per Restore tap) with a small burst
   * margin for the activating screen's manual refresh button.
   *
   * Forbidden in trusted-contact context: the caller's own subscription
   * is unrelated to the plan they're acting on, so a sync there would
   * reconcile the wrong RC subscriber and return entitlements that
   * don't match what we just wrote.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 10_000 },
    medium: { limit: 10, ttl: 60_000 },
  })
  async syncEntitlements(): Promise<EntitlementInfo> {
    if (this.cls.get('planOwnerId')) {
      throw new BadRequestException(
        'Cannot sync entitlements from a trusted-contact context. Switch to your own plan first.',
      );
    }
    const userId = this.cls.requireUserId();
    await this.revenuecatService.reconcileFromRc(userId);
    return this.entitlementsService.getEntitlementInfo();
  }
}
