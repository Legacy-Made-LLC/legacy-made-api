import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ApiConfigService } from '../config/api-config.service';

export interface InvitationTokenPayload {
  trustedContactId: string;
  planId: string;
  email: string;
}

@Injectable()
export class InvitationTokenService {
  private readonly secret: string;

  constructor(private readonly config: ApiConfigService) {
    this.secret = this.config.get('INVITATION_TOKEN_SECRET');
  }

  /**
   * Generate a secure invitation token
   * Token expires in 30 days
   */
  generateToken(payload: InvitationTokenPayload): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: '30d',
      issuer: 'legacy-made-api',
      audience: 'legacy-made-invitation',
    });
  }

  /**
   * Verify and decode an invitation token
   * Throws UnauthorizedException if invalid or expired
   */
  verifyToken(token: string): InvitationTokenPayload {
    try {
      const payload = jwt.verify(token, this.secret, {
        issuer: 'legacy-made-api',
        audience: 'legacy-made-invitation',
      }) as InvitationTokenPayload;

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Invitation link has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid invitation link');
      }
      throw new UnauthorizedException('Invalid invitation token');
    }
  }
}
