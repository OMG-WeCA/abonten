import { Controller, Get } from '@nestjs/common';
import { BookingService } from './booking.service';

@Controller('booking')
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Get()
  findAll(): string[] {
    return this.service.findAll();
  }
}
