import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { AccessLevel, ApiClsStore } from '../lib/types/cls';
import { PlanAccessService } from './plan-access.service';

export const REQUIRED_ACCESS_LEVEL = 'required_access_level';

/**
 * Decorator to require a minimum access level for trusted contacts.
 * Owners always pass this check. Trusted contacts must have the specified level.
 *
 * Use on write endpoints (POST, PATCH, DELETE) to restrict mutations
 * to trusted contacts with 'full_edit' access.
 *
 * @example
 * ```ts
 * @Post()
 * @RequiresAccessLevel('full_edit')
 * create() { ... }
 * ```
 */
export const RequiresAccessLevel = (level: AccessLevel) =>
  SetMetadata(REQUIRED_ACCESS_LEVEL, level);

/**
 * Guard that determines the user's access role for a plan and stores it in CLS.
 *
 * Must be used on controllers with :planId in the route path.
 * Runs before EntitlementsGuard so the entitlements check can be skipped
 * for trusted contacts.
 *
 * Behavior:
 * - Owners: sets planAccessRole='owner' in CLS, always passes
 * - Trusted contacts: sets planAccessRole='trusted_contact' + planAccessLevel in CLS,
 *   then checks @RequiresAccessLevel if present
 * - No access: throws ForbiddenException
 */
@Injectable()
export class PlanAccessGuard implements CanActivate {
  constructor(
    private readonly planAccessService: PlanAccessService,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const planId = request.params?.planId;

    // If no planId in route, skip this guard (let other guards handle it)
    if (!planId) {
      return true;
    }

    const access = await this.planAccessService.getPlanAccess(planId);

    if (!access) {
      throw new ForbiddenException('You do not have access to this plan');
    }

    // Store access context in CLS for downstream use
    this.cls.set('planAccessRole', access.role);
    if (access.accessLevel) {
      this.cls.set('planAccessLevel', access.accessLevel);
    }

    // For trusted contacts, check the required access level
    if (access.role === 'trusted_contact') {
      const requiredLevel = this.reflector.getAllAndOverride<
        AccessLevel | undefined
      >(REQUIRED_ACCESS_LEVEL, [context.getHandler(), context.getClass()]);

      if (requiredLevel === 'full_edit' && access.accessLevel !== 'full_edit') {
        throw new ForbiddenException(
          'You do not have edit access to this plan',
        );
      }
    }

    return true;
  }
}
