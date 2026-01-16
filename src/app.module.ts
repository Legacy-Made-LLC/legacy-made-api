import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { configSchema } from './config';
import { ApiConfigModule } from './config/api-config.module';
import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { EntriesModule } from './entries/entries.module';
import { PlansModule } from './plans/plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => configSchema.parse(env),
    }),
    ApiConfigModule,
    DbModule,
    AuthModule,
    UsersModule,
    EntriesModule,
    PlansModule,
  ],
  controllers: [],
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
