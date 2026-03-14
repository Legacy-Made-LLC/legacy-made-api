import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { EncryptionController } from './encryption.controller';
import { KmsService } from './kms.service';
import { DeviceLinkingService } from './device-linking.service';

@Module({
  providers: [EncryptionService, KmsService, DeviceLinkingService],
  controllers: [EncryptionController],
  exports: [EncryptionService],
})
export class EncryptionModule {}
