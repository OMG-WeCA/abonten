import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('api.port', 3000);

  // Session middleware is required by the Azure AD (Entra ID) OIDC strategy state/nonce.
  app.use(
    session({
      secret: config.get<string>('session.secret') ?? 'change-me-session-dev',
      resave: false,
      saveUninitialized: false,
    }),
  );

  // /health stays at the root; everything else is under /api.
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

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
