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
} from '@nestjs/common';
import type { Request } from 'express';
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
   * Decline an invitation (can be unauthenticated)
   */
  @Post(':token/decline')
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
