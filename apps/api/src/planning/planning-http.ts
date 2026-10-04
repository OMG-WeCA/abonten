import type { NestExpressApplication } from '@nestjs/platform-express';

// A confirmed 60,000-character brief plus its message can exceed the default
// 100 KB with UTF-8. Keep a compatible byte limit as well as DTO character limits.
export const PLANNING_JSON_MAX_BYTES = 512 * 1024;

export function configureApiBodyLimits(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: PLANNING_JSON_MAX_BYTES });
  app.useBodyParser('urlencoded', { extended: true, limit: 100 * 1024 });
}
