import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from './entitlements.service';
import { Pillar, QuotaFeature } from './entitlements.types';

export const REQUIRED_PILLAR = 'required_pillar';
export const REQUIRED_VIEW_PILLAR = 'required_view_pillar';
export const REQUIRED_QUOTA = 'required_quota';

/**
 * Decorator to require edit/create access to a specific pillar.
 * Use with EntitlementsGuard.
 *
 * @example
 * ```ts
 * @UseGuards(EntitlementsGuard)
 * @RequiresPillar('messages')
 * @Post()
 * create() { ... }
 * ```
 */
export const RequiresPillar = (pillar: Pillar) =>
  SetMetadata(REQUIRED_PILLAR, pillar);

/**
 * Decorator to require view access to a specific pillar.
 * Less restrictive than RequiresPillar - allows view-only access.
 * Use with EntitlementsGuard.
 *
 * @example
 * ```ts
 * @UseGuards(EntitlementsGuard)
 * @RequiresViewPillar('messages')
 * @Get()
 * findAll() { ... }
 * ```
 */
export const RequiresViewPillar = (pillar: Pillar) =>
  SetMetadata(REQUIRED_VIEW_PILLAR, pillar);

/**
 * Decorator to require quota availability for a feature.
 * Use with EntitlementsGuard.
 *
 * @example
 * ```ts
 * @UseGuards(EntitlementsGuard)
 * @RequiresQuota('legacy_messages')
 * @Post()
 * create() { ... }
 * ```
 */
export const RequiresQuota = (feature: QuotaFeature) =>
  SetMetadata(REQUIRED_QUOTA, feature);

@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPillar = this.reflector.getAllAndOverride<Pillar | undefined>(
      REQUIRED_PILLAR,
      [context.getHandler(), context.getClass()],
    );

    const requiredViewPillar = this.reflector.getAllAndOverride<
      Pillar | undefined
    >(REQUIRED_VIEW_PILLAR, [context.getHandler(), context.getClass()]);

    const requiredQuota = this.reflector.getAllAndOverride<
      QuotaFeature | undefined
    >(REQUIRED_QUOTA, [context.getHandler(), context.getClass()]);

    // All checks run in a single DB transaction inside the service
    await this.entitlementsService.checkGuardEntitlements({
      pillar: requiredPillar,
      viewPillar: requiredViewPillar,
      quota: requiredQuota,
    });

    return true;
  }
}
