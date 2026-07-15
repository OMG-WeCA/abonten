import { Controller, Get } from '@nestjs/common';
import { PlanningService } from './planning.service';

@Controller('planning')
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  @Get()
  findAll(): string[] {
    return this.service.findAll();
  }
}
