import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { of } from 'rxjs';
import { ApiClsService } from './api-cls.service';
import { RequestContextInterceptor } from './request-context.interceptor';

describe('RequestContextInterceptor', () => {
  let interceptor: RequestContextInterceptor;
  let mockClsService: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    mockClsService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestContextInterceptor,
        ApiClsService,
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    interceptor = module.get<RequestContextInterceptor>(
      RequestContextInterceptor,
    );
  });

  const createMockContext = (headers: Record<string, string>, ip?: string) => {
    const req = { headers, ip };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  const mockNext: CallHandler = { handle: () => of('result') };

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should set ipAddress from x-forwarded-for header', (done) => {
    const context = createMockContext(
      { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'user-agent': 'TestAgent' },
      '127.0.0.1',
    );

    interceptor.intercept(context, mockNext).subscribe(() => {
      expect(mockClsService.set).toHaveBeenCalledWith('ipAddress', '1.2.3.4');
      expect(mockClsService.set).toHaveBeenCalledWith('userAgent', 'TestAgent');
      done();
    });
  });

  it('should fall back to req.ip when x-forwarded-for is absent', (done) => {
    const context = createMockContext(
      { 'user-agent': 'TestAgent' },
      '192.168.1.1',
    );

    interceptor.intercept(context, mockNext).subscribe(() => {
      expect(mockClsService.set).toHaveBeenCalledWith(
        'ipAddress',
        '192.168.1.1',
      );
      done();
    });
  });

  it('should set undefined when no IP source is available', (done) => {
    const context = createMockContext({});

    interceptor.intercept(context, mockNext).subscribe(() => {
      expect(mockClsService.set).toHaveBeenCalledWith('ipAddress', undefined);
      expect(mockClsService.set).toHaveBeenCalledWith('userAgent', undefined);
      done();
    });
  });
});
