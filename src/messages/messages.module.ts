import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [FilesModule],
  providers: [MessagesService],
  controllers: [MessagesController],
})
export class MessagesModule {}
