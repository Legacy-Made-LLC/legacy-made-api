import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { configSchema } from './config';
import { ApiConfigModule } from './config/api-config.module';
import { DbModule } from './db/db.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { EntriesModule } from './entries/entries.module';
import { HealthModule } from './health/health.module';
import { PlansModule } from './plans/plans.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => configSchema.parse(env),
    }),
    ApiConfigModule,
    AuthModule, // Must come before DbModule for CLS to be available
    DbModule,
    EntitlementsModule,
    UsersModule,
    EntriesModule,
    PlansModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule {}
