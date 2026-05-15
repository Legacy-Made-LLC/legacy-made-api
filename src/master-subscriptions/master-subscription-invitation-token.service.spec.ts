import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { ApiConfigService } from '../config/api-config.service';
import { MasterSubInvitationTokenService } from './master-subscription-invitation-token.service';

describe('MasterSubInvitationTokenService', () => {
  let service: MasterSubInvitationTokenService;

  const validPayload = {
    masterSubscriptionId: 'master_sub_1',
    memberId: 'member_1',
    email: 'jane@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterSubInvitationTokenService,
        {
          provide: ApiConfigService,
          useValue: {
            get: (key: string) =>
              key === 'MASTER_SUB_INVITATION_TOKEN_SECRET'
                ? 'test-secret-for-master-sub-invites'
                : undefined,
          },
        },
      ],
    }).compile();

    service = module.get<MasterSubInvitationTokenService>(
      MasterSubInvitationTokenService,
    );
  });

  it('round-trips a payload through generate/verify', () => {
    const token = service.generateToken(validPayload);
    const decoded = service.verifyToken(token);

    expect(decoded.masterSubscriptionId).toBe(
      validPayload.masterSubscriptionId,
    );
    expect(decoded.memberId).toBe(validPayload.memberId);
    expect(decoded.email).toBe(validPayload.email);
  });

  it('rejects an expired token with a friendly message', () => {
    const token = jwt.sign(validPayload, 'test-secret-for-master-sub-invites', {
      expiresIn: -10,
      issuer: 'legacy-made-api',
      audience: 'legacy-made-master-sub-invitation',
    });

    expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    expect(() => service.verifyToken(token)).toThrow(/expired/i);
  });

  it('rejects a token signed with the wrong secret (tampering)', () => {
    const tampered = jwt.sign(validPayload, 'wrong-secret', {
      expiresIn: '7d',
      issuer: 'legacy-made-api',
      audience: 'legacy-made-master-sub-invitation',
    });
    expect(() => service.verifyToken(tampered)).toThrow(UnauthorizedException);
  });

  it('rejects a token with the wrong audience (TC token reused)', () => {
    const tcShapedToken = jwt.sign(
      validPayload,
      'test-secret-for-master-sub-invites',
      {
        expiresIn: '7d',
        issuer: 'legacy-made-api',
        audience: 'legacy-made-invitation', // trusted-contacts audience
      },
    );
    expect(() => service.verifyToken(tcShapedToken)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a syntactically invalid token', () => {
    expect(() => service.verifyToken('not.a.real.jwt')).toThrow(
      UnauthorizedException,
    );
  });
});
