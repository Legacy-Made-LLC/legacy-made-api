import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { RequestContextInterceptor } from './lib/request-context.interceptor';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { configSchema } from './config';
import { ApiConfigModule } from './config/api-config.module';
import { DbModule } from './db/db.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { EntriesModule } from './entries/entries.module';
import { HealthModule } from './health/health.module';
import { PlansModule } from './plans/plans.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { WishesModule } from './wishes/wishes.module';
import { ProgressModule } from './progress/progress.module';
import { EmailModule } from './email/email.module';
import { TrustedContactsModule } from './trusted-contacts/trusted-contacts.module';
import { AccessInvitationsModule } from './access-invitations/access-invitations.module';
import { PlanAccessModule } from './plan-access/plan-access.module';
import { SharedPlansModule } from './shared-plans/shared-plans.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { MessagesModule } from './messages/messages.module';
import { EncryptionModule } from './encryption/encryption.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { PreferencesModule } from './preferences/preferences.module';
import { RevenuecatModule } from './revenuecat/revenuecat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => configSchema.parse(env),
    }),
    ScheduleModule.forRoot(),
    // Rate limiting - not applied globally, used via @UseGuards(ThrottlerGuard) on specific endpoints
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 20, // 20 requests per minute
      },
    ]),
    CacheModule,
    ApiConfigModule,
    AuthModule, // Must come before DbModule for CLS to be available
    DbModule,
    PlanAccessModule, // Must come after DbModule; provides PlanAccessGuard to controllers
    EntitlementsModule,
    UsersModule,
    EntriesModule,
    PlansModule,
    HealthModule,
    FilesModule,
    WishesModule,
    ProgressModule,
    EmailModule,
    PushNotificationsModule,
    TrustedContactsModule,
    AccessInvitationsModule,
    SharedPlansModule,
    ActivityLogModule,
    MessagesModule,
    EncryptionModule,
    PreferencesModule,
    RevenuecatModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule {}
