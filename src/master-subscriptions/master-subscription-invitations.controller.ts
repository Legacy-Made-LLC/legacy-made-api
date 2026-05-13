import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { ApiClsService } from '../lib/api-cls.service';
import { MasterSubscriptionsService } from './master-subscriptions.service';

/**
 * Member-facing invitation endpoints. Preview is public (no auth — the
 * member may not be signed in yet). Acceptance requires a Clerk session
 * — but does not require the signed-in email to match the invited email
 * (mirrors the trusted-contacts pattern; the token IS the auth boundary).
 */
@Controller('master-subscription-invitations')
export class MasterSubscriptionInvitationsController {
  constructor(
    private readonly service: MasterSubscriptionsService,
    private readonly cls: ApiClsService,
  ) {}

  /**
   * Preview the invitation — used by the web fallback (legacy-made-web)
   * and the in-app preview screen before the user authenticates.
   */
  @Public()
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.service.previewInvite(token);
  }

  /**
   * Accept the invitation. Requires a Clerk-authenticated session;
   * acceptance is not email-locked — see service docstring.
   */
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string) {
    const userId = this.cls.requireUserId();
    return this.service.acceptInvite(token, userId);
  }
}
