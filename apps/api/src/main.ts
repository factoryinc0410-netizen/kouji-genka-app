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
        // SSO 統合 (ADR-003) のために 'lax' を使用する。
        // 'strict' だと Factoryskills (別 origin) → KGK の cross-site redirect
        // チェーン経由で Set-Cookie が届いても、その後の top-level navigation
        // で送信されず、即 /login に飛ばされてしまう (= login スキップ失敗)。
        // 'lax' は OAuth/SSO で標準的な設定で、top-level GET navigation では
        // cross-site でも cookie を送信する。POST やリソース読み込み (img/iframe)
        // は依然として same-site のみで保護される。
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
