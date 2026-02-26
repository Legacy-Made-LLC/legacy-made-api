import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ApiClsService } from '../lib/api-cls.service';
import { AuthGuard } from './auth.guard';
import { CLERK_CLIENT } from '../lib/clerk/client';

describe('AuthGuard', () => {
  let guard: AuthGuard;

  const mockClerkClient = {
    authenticateRequest: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockClsService = {
    set: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: CLERK_CLIENT,
          useValue: mockClerkClient,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: ApiClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
