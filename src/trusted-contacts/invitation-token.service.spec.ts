import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { ApiConfigService } from '../config/api-config.service';
import {
  InvitationTokenService,
  InvitationTokenPayload,
} from './invitation-token.service';

describe('InvitationTokenService', () => {
  let service: InvitationTokenService;
  const testSecret = 'test-secret-key-for-testing';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationTokenService,
        {
          provide: ApiConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(testSecret),
          },
        },
      ],
    }).compile();

    service = module.get<InvitationTokenService>(InvitationTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const token = service.generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should embed the payload in the token', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const token = service.generateToken(payload);
      const decoded = jwt.verify(token, testSecret, {
        issuer: 'legacy-made-api',
        audience: 'legacy-made-invitation',
      }) as InvitationTokenPayload;

      expect(decoded.trustedContactId).toBe(payload.trustedContactId);
      expect(decoded.planId).toBe(payload.planId);
      expect(decoded.email).toBe(payload.email);
    });

    it('should set correct issuer and audience', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const token = service.generateToken(payload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.iss).toBe('legacy-made-api');
      expect(decoded.aud).toBe('legacy-made-invitation');
    });

    it('should set 30-day expiration', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const before = Math.floor(Date.now() / 1000);
      const token = service.generateToken(payload);
      const decoded = jwt.decode(token) as any;

      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(thirtyDaysInSeconds);
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
    });
  });

  describe('verifyToken', () => {
    it('should verify and return payload for a valid token', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const token = service.generateToken(payload);
      const result = service.verifyToken(token);

      expect(result.trustedContactId).toBe(payload.trustedContactId);
      expect(result.planId).toBe(payload.planId);
      expect(result.email).toBe(payload.email);
    });

    it('should throw UnauthorizedException for expired tokens', () => {
      const token = jwt.sign(
        {
          trustedContactId: 'tc-123',
          planId: 'plan-456',
          email: 'test@example.com',
        },
        testSecret,
        {
          expiresIn: '-1s',
          issuer: 'legacy-made-api',
          audience: 'legacy-made-invitation',
        },
      );

      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
      expect(() => service.verifyToken(token)).toThrow(
        'Invitation link has expired',
      );
    });

    it('should throw UnauthorizedException for tampered tokens', () => {
      const payload: InvitationTokenPayload = {
        trustedContactId: 'tc-123',
        planId: 'plan-456',
        email: 'test@example.com',
      };

      const token = service.generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => service.verifyToken(tamperedToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.verifyToken(tamperedToken)).toThrow(
        'Invalid invitation link',
      );
    });

    it('should throw UnauthorizedException for tokens signed with wrong secret', () => {
      const token = jwt.sign(
        {
          trustedContactId: 'tc-123',
          planId: 'plan-456',
          email: 'test@example.com',
        },
        'wrong-secret',
        {
          expiresIn: '30d',
          issuer: 'legacy-made-api',
          audience: 'legacy-made-invitation',
        },
      );

      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong issuer', () => {
      const token = jwt.sign(
        {
          trustedContactId: 'tc-123',
          planId: 'plan-456',
          email: 'test@example.com',
        },
        testSecret,
        {
          expiresIn: '30d',
          issuer: 'wrong-issuer',
          audience: 'legacy-made-invitation',
        },
      );

      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong audience', () => {
      const token = jwt.sign(
        {
          trustedContactId: 'tc-123',
          planId: 'plan-456',
          email: 'test@example.com',
        },
        testSecret,
        {
          expiresIn: '30d',
          issuer: 'legacy-made-api',
          audience: 'wrong-audience',
        },
      );

      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for completely invalid tokens', () => {
      expect(() => service.verifyToken('not-a-jwt')).toThrow(
        UnauthorizedException,
      );
    });
  });
});
