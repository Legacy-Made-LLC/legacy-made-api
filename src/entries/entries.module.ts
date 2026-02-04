import { Module } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { EntriesController } from './entries.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  providers: [EntriesService],
  controllers: [EntriesController],
})
export class EntriesModule {}
