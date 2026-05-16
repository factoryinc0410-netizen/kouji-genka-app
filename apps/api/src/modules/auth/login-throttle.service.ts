import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

export interface ThrottleResult {
  locked: boolean;
  attempts: number;
  limit: number;
  windowSec: number;
}

@Injectable()
export class LoginThrottleService {
  private readonly limit: number;
  private readonly windowSec: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.limit = Number(config.get('LOGIN_ATTEMPT_LIMIT') ?? 5);
    this.windowSec = Number(config.get('LOGIN_LOCK_WINDOW_SEC') ?? 600);
  }

  private key(email: string): string {
    return `kgk:login_attempts:${email.toLowerCase()}`;
  }

  /** 試行回数を 1 加算し、ロック状態を返す。新規キーには TTL を付与。 */
  async registerAttempt(email: string): Promise<ThrottleResult> {
    const key = this.key(email);
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, this.windowSec);
    }
    return {
      attempts,
      limit: this.limit,
      windowSec: this.windowSec,
      locked: attempts > this.limit,
    };
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
