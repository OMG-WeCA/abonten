import { Module } from '@nestjs/common';
import { PopController } from './pop.controller';
import { PopService } from './pop.service';

@Module({
  controllers: [PopController],
  providers: [PopService],
})
export class PopModule {}
