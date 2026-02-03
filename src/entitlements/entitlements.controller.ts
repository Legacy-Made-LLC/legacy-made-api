import { Controller, Get } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { EntitlementInfo } from './entitlements.types';

@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  getEntitlements(): Promise<EntitlementInfo> {
    return this.entitlementsService.getEntitlementInfo();
  }
}
