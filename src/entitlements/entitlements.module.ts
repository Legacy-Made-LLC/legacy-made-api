import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsGuard } from './entitlements.guard';
import { EntitlementsController } from './entitlements.controller';

@Global()
@Module({
  providers: [EntitlementsService, EntitlementsGuard],
  exports: [EntitlementsService, EntitlementsGuard],
  controllers: [EntitlementsController],
})
export class EntitlementsModule {}
