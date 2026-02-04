import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { R2Service } from './r2.service';
import { MuxService } from './mux.service';

@Module({
  providers: [FilesService, R2Service, MuxService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
