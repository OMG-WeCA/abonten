import { Controller, Get } from '@nestjs/common';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get()
  findAll(): string[] {
    return this.service.findAll();
  }
}
