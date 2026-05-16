import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginThrottleService } from './login-throttle.service';

function buildRedis() {
  return {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
  };
}

function buildConfig(): ConfigService {
  const map: Record<string, string> = {
    LOGIN_ATTEMPT_LIMIT: '5',
    LOGIN_LOCK_WINDOW_SEC: '600',
  };
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe('LoginThrottleService', () => {
  let redis: ReturnType<typeof buildRedis>;
  let service: LoginThrottleService;

  beforeEach(() => {
    redis = buildRedis();
    // biome-ignore lint/suspicious/noExplicitAny: テストの簡略化
    service = new LoginThrottleService(redis as any, buildConfig());
  });

  it('初回試行は expire を付与し locked=false', async () => {
    redis.incr.mockResolvedValue(1);
    const result = await service.registerAttempt('user@example.com');
    expect(result).toEqual({ attempts: 1, limit: 5, windowSec: 600, locked: false });
    expect(redis.expire).toHaveBeenCalledWith('kgk:login_attempts:user@example.com', 600);
  });

  it('2 回目以降は expire を呼ばない', async () => {
    redis.incr.mockResolvedValue(2);
    await service.registerAttempt('user@example.com');
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('limit を超えると locked=true', async () => {
    redis.incr.mockResolvedValue(6);
    const result = await service.registerAttempt('user@example.com');
    expect(result.locked).toBe(true);
  });

  it('reset でキーを削除する', async () => {
    await service.reset('User@Example.com');
    expect(redis.del).toHaveBeenCalledWith('kgk:login_attempts:user@example.com');
  });
});
