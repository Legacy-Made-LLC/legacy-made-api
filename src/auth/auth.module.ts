import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { ApiConfigService } from 'src/config/api-config.service';
import { CLERK_CLIENT, createClerkClientFactory } from 'src/lib/clerk/client';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      middleware: {
        mount: true,
      },
    }),
  ],
  providers: [
    AuthService,
    {
      provide: CLERK_CLIENT,
      useFactory: (config: ApiConfigService) =>
        createClerkClientFactory(config),
      inject: [ApiConfigService],
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  controllers: [AuthController],
  exports: [ClsModule],
})
export class AuthModule {}
