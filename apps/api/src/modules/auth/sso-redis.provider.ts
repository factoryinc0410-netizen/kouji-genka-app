import type { Provider } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * SSO チケット交換用の Redis client (ADR-003)。
 *
 * 既存の session store (main.ts で `new Redis(REDIS_URL)` を connect-redis に
 * 渡している) と同じインスタンスでも問題ないが、依存方向の見通しを保つため
 * AuthModule 専用に薄く provider を立てる。
 */
export const SSO_REDIS = Symbol('SSO_REDIS');

export const SsoRedisProvider: Provider = {
  provide: SSO_REDIS,
  useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
};
