import { createClerkClient } from '@clerk/express';
import { ApiConfigService } from 'src/config/api-config.service';

export const CLERK_CLIENT = Symbol('CLERK_CLIENT');

export const createClerkClientFactory = (config: ApiConfigService) => {
  return createClerkClient({
    secretKey: config.get('CLERK_SECRET_KEY'),
    publishableKey: config.get('CLERK_PUBLIC_KEY'),
    jwtKey: config.get('CLERK_JWT_KEY'),
  });
};
