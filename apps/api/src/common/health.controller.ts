import { Controller, Get } from '@nestjs/common';

// Liveness-only health check. No DB/Redis dependency, so it returns 200 even
// before infrastructure is up. (Hand-rolled to avoid pulling @nestjs/terminus,
// which transitively depends on @prisma/client; the project uses TypeORM, not Prisma.)
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
