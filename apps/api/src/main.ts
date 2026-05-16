import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import RedisStore from 'connect-redis';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    // ファイルダウンロード時、ブラウザ側 JS から Content-Disposition を読むために expose
    exposedHeaders: ['Content-Disposition'],
  });

  app.use(cookieParser(process.env.COOKIE_SECRET ?? 'dev-cookie-secret'));

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const sessionStore = new RedisStore({
    client: new Redis(redisUrl),
    prefix: 'kgk:sess:',
    ttl: 60 * 60 * 8,
  });

  app.use(
    session({
      store: sessionStore,
      name: 'kgk.sid',
      secret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
