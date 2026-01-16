import { type ClerkClient } from '@clerk/express';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiClsStore } from 'src/lib/types/cls';
import { ClsService } from 'nestjs-cls';
import { CLERK_CLIENT } from 'src/lib/clerk/client';
import type { Request as ExpressRequest } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const BYPASS_JWT_AUTH = 'bypassJwtAuth';
export const BypassJwtAuth = () => SetMetadata(BYPASS_JWT_AUTH, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(CLERK_CLIENT) private readonly clerkClient: ClerkClient,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<ApiClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const bypassJwtAuth = this.reflector.getAllAndOverride<boolean>(
      BYPASS_JWT_AUTH,
      [context.getHandler(), context.getClass()],
    );

    if (bypassJwtAuth) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ExpressRequest>();

    // Clerk has a bug where it's expecting the Web API Request object, not
    // the Express Request object.
    const webApiRequest = createWebApiRequest(request);

    const { isAuthenticated, toAuth } =
      await this.clerkClient.authenticateRequest(webApiRequest, {
        authorizedParties: ['https://example.com'],
      });

    if (!isAuthenticated) {
      if (isPublic) {
        return true;
      } else {
        throw new UnauthorizedException();
      }
    }

    const auth = toAuth();
    if (auth !== null) {
      this.cls.set('userId', auth.userId);
    }

    return true;
  }
}

const createWebApiRequest = (req: ExpressRequest): Request => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  return new Request(url, {
    method: req.method,
    headers: new Headers(req.headers as Record<string, string>),
    body: ['GET', 'HEAD'].includes(req.method)
      ? null
      : JSON.stringify(req.body),
  });
};
