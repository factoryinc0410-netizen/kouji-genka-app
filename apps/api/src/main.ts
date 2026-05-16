import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
