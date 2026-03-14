import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { type Request } from 'express';
import { Observable } from 'rxjs';
import { ApiClsService } from './api-cls.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ApiClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    const userAgent = req.headers['user-agent'];

    this.cls.set('ipAddress', ipAddress);
    this.cls.set('userAgent', userAgent);

    return next.handle();
  }
}
