import { Module } from '@nestjs/common';
import { ProcessedEventsPruneService } from './processed-events-prune.service';
import { RevenuecatService } from './revenuecat.service';
import { RevenuecatController } from './revenuecat.controller';

@Module({
  providers: [RevenuecatService, ProcessedEventsPruneService],
  controllers: [RevenuecatController],
  exports: [RevenuecatService],
})
export class RevenuecatModule {}
