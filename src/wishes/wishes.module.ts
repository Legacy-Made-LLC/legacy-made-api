import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { WishesController } from './wishes.controller';
import { WishesService } from './wishes.service';

@Module({
  imports: [FilesModule],
  providers: [WishesService],
  controllers: [WishesController],
})
export class WishesModule {}
