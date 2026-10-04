import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync } from 'node:fs';
import session from 'express-session';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { oidcSessionOptions } from './common/oidc-session-options';
import { OidcRedisSessionStore } from './common/oidc-session-store';
import { RedisService } from './common/redis.service';
import { configureApiBodyLimits } from './planning/planning-http';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApiBodyLimits(app);
  const config = app.get(ConfigService);
  const port = config.get<number>('api.port', 3000);

  // Ensure the local asset-upload directory exists (dev disk storage) to avoid
  // ENOENT on the first multipart upload.
  mkdirSync(process.env.UPLOADS_DIR ?? './uploads', { recursive: true });

  // Session middleware protects Azure AD (Entra ID) OIDC state and nonce.
  const nodeEnv = config.get<string>('nodeEnv') ?? 'development';
  if (nodeEnv === 'production') app.set('trust proxy', 1);
  const oidcSessionStore = new OidcRedisSessionStore(app.get(RedisService).instance);
  app.use(
    session(oidcSessionOptions(config.get<string>('session.secret'), nodeEnv, oidcSessionStore)),
  );

  // /health stays at the root; everything else is under /api.
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Browser dashboard and API may be deployed on distinct configured origins.
  // Reflect the requesting origin for the bearer-token API (no cookie credentials),
  // including preview and local development hosts without adding a UI-only backdoor.
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Id'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Abonten API')
    .setDescription('Outdoor advertising planning, booking & measurement — OMG WeCA')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port);
  Logger.log(`Abonten API listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger:   http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
