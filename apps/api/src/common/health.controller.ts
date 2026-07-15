import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

// Liveness-only health check (no DB/Redis dependency) so it returns 200 even before infra is up.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => ({ api: { status: 'up' as const } }),
    ]);
  }
}
