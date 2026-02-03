import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsGuard } from './entitlements.guard';
import { EntitlementsController } from './entitlements.controller';
import { SubscriptionExpirationService } from './subscription-expiration.service';

@Global()
@Module({
  providers: [
    EntitlementsService,
    EntitlementsGuard,
    SubscriptionExpirationService,
  ],
  exports: [EntitlementsService, EntitlementsGuard],
  controllers: [EntitlementsController],
})
export class EntitlementsModule {}
