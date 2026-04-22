import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
   * Idempotent and safe to call repeatedly.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncEntitlements(): Promise<EntitlementInfo> {
    const userId = this.cls.requireUserId();
    await this.revenuecatService.reconcileFromRc(userId);
    return this.entitlementsService.getEntitlementInfo();
  }
}
