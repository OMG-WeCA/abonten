import { Controller, Get } from '@nestjs/common';
import { PopService } from './pop.service';

@Controller('pop')
export class PopController {
  constructor(private readonly service: PopService) {}

  @Get()
  findAll(): string[] {
    return this.service.findAll();
  }
}
