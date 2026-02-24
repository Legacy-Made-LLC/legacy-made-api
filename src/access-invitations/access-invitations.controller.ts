import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  ParseUUIDPipe,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/auth.guard';
import { AccessInvitationsService } from './access-invitations.service';

@Controller('access-invitations')
export class AccessInvitationsController {
  constructor(
    private readonly accessInvitationsService: AccessInvitationsService,
  ) {}

  /**
   * GET /access-invitations/:token
   * View invitation details (public endpoint, no auth required)
   */
  @Get(':token')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  getInvitationDetails(@Param('token') token: string) {
    return this.accessInvitationsService.getInvitationDetails(token);
  }

  /**
   * POST /access-invitations/:token/accept
   * Accept an invitation (authenticated)
   * Requires current user from request (set by auth middleware)
   */
  @Post(':token/accept')
  acceptInvitation(@Param('token') token: string, @Req() req: Request) {
    const currentUserId = (req as any).auth?.userId;
    if (!currentUserId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.accessInvitationsService.acceptInvitation(token, currentUserId);
  }

  /**
   * POST /access-invitations/:token/decline
   * Decline an invitation (public endpoint, no auth required)
   */
  @Post(':token/decline')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60000 },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  declineInvitation(@Param('token') token: string) {
    return this.accessInvitationsService.declineInvitation(token);
  }

  /**
   * DELETE /plans/:planId/my-access
   * Self-revoke access to a plan (authenticated)
   */
  @Delete('plans/:planId/my-access')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeOwnAccess(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Req() req: Request,
  ) {
    const currentUserId = (req as any).auth?.userId;
    if (!currentUserId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.accessInvitationsService.revokeOwnAccess(planId, currentUserId);
  }
}
