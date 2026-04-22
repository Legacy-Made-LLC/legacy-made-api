import { Module } from '@nestjs/common';
import { RevenuecatService } from './revenuecat.service';
import { RevenuecatController } from './revenuecat.controller';

@Module({
  providers: [RevenuecatService],
  controllers: [RevenuecatController],
  exports: [RevenuecatService],
})
export class RevenuecatModule {}
