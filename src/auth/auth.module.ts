import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiConfigService } from 'src/config/api-config.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { CLERK_CLIENT, createClerkClientFactory } from 'src/lib/clerk/client';
import { ClsModule } from 'nestjs-cls';

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
})
export class AuthModule {}
