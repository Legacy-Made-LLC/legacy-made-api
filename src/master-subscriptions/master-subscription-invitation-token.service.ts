import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ApiConfigService } from '../config/api-config.service';

export interface MasterSubInvitationTokenPayload {
  masterSubscriptionId: string;
  memberId: string;
  email: string;
}

/**
 * JWT-based invite tokens for master subscription members. Forked from
 * the trusted-contacts token service but:
 *   - 7-day TTL (operational tokens, shorter than the 30-day personal
 *     trusted-contact invites)
 *   - Distinct signing secret so rotating one type's secret doesn't
 *     invalidate outstanding invites of the other type
 *   - Distinct audience claim so a TC token can't accidentally be
 *     accepted as a master-sub invite
 */
@Injectable()
export class MasterSubInvitationTokenService {
  private readonly secret: string;

  constructor(private readonly config: ApiConfigService) {
    this.secret = this.config.get('MASTER_SUB_INVITATION_TOKEN_SECRET');
  }

  generateToken(payload: MasterSubInvitationTokenPayload): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: '7d',
      issuer: 'legacy-made-api',
      audience: 'legacy-made-master-sub-invitation',
    });
  }

  verifyToken(token: string): MasterSubInvitationTokenPayload {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'legacy-made-api',
        audience: 'legacy-made-master-sub-invitation',
      }) as MasterSubInvitationTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Invitation link has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid invitation link');
      }
      throw new UnauthorizedException('Invalid invitation token');
    }
  }
}
