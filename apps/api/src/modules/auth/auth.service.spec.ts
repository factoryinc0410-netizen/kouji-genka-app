import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { InvalidCredentialsException, TooManyAttemptsException } from './auth.exceptions';
import { AuthService } from './auth.service';
import type { LoginThrottleService } from './login-throttle.service';

vi.mock('@node-rs/argon2', () => ({
  verify: vi.fn(),
}));

import { verify } from '@node-rs/argon2';

const seedUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'admin@kgk.local',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
  name: '初期管理者',
  isActive: true,
  deletedAt: null,
  lastLoginAt: null,
  role: { code: 'admin' as const, name: '管理者' },
};

const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

function buildService() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(seedUser),
    },
  } as unknown as PrismaService;

  const throttle = {
    registerAttempt: vi.fn().mockResolvedValue({
      attempts: 1,
      limit: 5,
      windowSec: 600,
      locked: false,
    }),
    reset: vi.fn().mockResolvedValue(undefined),
  } as unknown as LoginThrottleService;

  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  // SSO 用 Redis (ADR-003)。login の経路では呼ばれないので noop で十分。
  const redis = {
    getdel: vi.fn(),
    setex: vi.fn(),
  } as unknown as import('ioredis').Redis;

  return {
    service: new AuthService(prisma, throttle, audit, redis),
    prisma,
    throttle,
    audit,
    redis,
  };
}

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.mocked(verify).mockReset();
  });

  it('正しい資格情報で PublicUser を返し audit に login を記録する', async () => {
    const { service, prisma, throttle, audit } = buildService();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(seedUser as never);
    vi.mocked(verify).mockResolvedValue(true);

    const user = await service.login('admin@kgk.local', 'correct_password', ctx);

    expect(user.email).toBe('admin@kgk.local');
    expect(user.role.code).toBe('admin');
    expect(throttle.reset).toHaveBeenCalledWith('admin@kgk.local');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login', userId: seedUser.id }),
    );
  });

  it('パスワード不一致は InvalidCredentialsException と login_failed 監査ログ', async () => {
    const { service, prisma, audit } = buildService();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(seedUser as never);
    vi.mocked(verify).mockResolvedValue(false);

    await expect(service.login('admin@kgk.local', 'wrong', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login_failed',
        userId: seedUser.id,
        after: expect.objectContaining({ reason: 'invalid_password' }),
      }),
    );
  });

  it('未知のメールは InvalidCredentialsException と reason=unknown_user', async () => {
    const { service, prisma, audit } = buildService();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(service.login('ghost@kgk.local', 'whatever', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login_failed',
        userId: null,
        after: expect.objectContaining({ reason: 'unknown_user' }),
      }),
    );
  });

  it('試行回数上限超過は TooManyAttemptsException', async () => {
    const { service, prisma, throttle, audit } = buildService();
    vi.mocked(throttle.registerAttempt).mockResolvedValue({
      attempts: 6,
      limit: 5,
      windowSec: 600,
      locked: true,
    });

    await expect(service.login('admin@kgk.local', 'x', ctx)).rejects.toBeInstanceOf(
      TooManyAttemptsException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login_failed',
        after: expect.objectContaining({ reason: 'locked' }),
      }),
    );
  });

  it('論理削除済みユーザはログイン不可', async () => {
    const { service, prisma } = buildService();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...seedUser,
      deletedAt: new Date(),
    } as never);
    vi.mocked(verify).mockResolvedValue(true);

    await expect(service.login('admin@kgk.local', 'correct', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout', () => {
  it('audit にログアウトを記録する', async () => {
    const { service, audit } = buildService();
    await service.logout(seedUser.id, ctx);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logout', userId: seedUser.id }),
    );
  });
});

// ── SSO 統合 (ADR-003) ─────────────────────────────────────────
import { createHmac } from 'node:crypto';

function buildServiceWithRole() {
  const prisma = {
    user: {
      upsert: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;

  const throttle = {
    registerAttempt: vi.fn(),
    reset: vi.fn(),
  } as unknown as LoginThrottleService;

  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const redis = {
    getdel: vi.fn(),
    setex: vi.fn(),
  } as unknown as import('ioredis').Redis;

  return {
    service: new AuthService(prisma, throttle, audit, redis),
    prisma,
    audit,
    redis,
  };
}

function signSsoPayload(
  payload: { username: string; display_name: string; role: string; iat: number },
  secret: string,
): string {
  const keys = Object.keys(payload).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = (payload as Record<string, unknown>)[k];
  return createHmac('sha256', secret).update(JSON.stringify(sorted)).digest('hex');
}

describe('AuthService.exchangeSsoTicket', () => {
  const SSO_SECRET = 'unit-test-secret';

  beforeEach(() => {
    process.env.KGK_SSO_SHARED_SECRET = SSO_SECRET;
    process.env.KGK_SSO_TICKET_MAX_AGE_SEC = '30';
  });

  function validPayload(
    overrides: Partial<{ username: string; display_name: string; role: string; iat: number }> = {},
  ) {
    const payload = {
      username: 'admin_alice',
      display_name: 'Alice',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    };
    const sig = signSsoPayload(payload as never, SSO_SECRET);
    return { ...payload, sig };
  }

  it('Redis に ticket が無ければ 401 (InvalidCredentialsException)', async () => {
    const { service, redis } = buildServiceWithRole();
    vi.mocked(redis.getdel).mockResolvedValue(null);
    await expect(service.exchangeSsoTicket('missing', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('HMAC 不一致なら 401', async () => {
    const { service, redis } = buildServiceWithRole();
    const tampered = { ...validPayload(), sig: '0'.repeat(64) };
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(tampered));
    await expect(service.exchangeSsoTicket('t', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('iat が古すぎる (max_age 超過) なら 401', async () => {
    const { service, redis } = buildServiceWithRole();
    const stale = validPayload({ iat: Math.floor(Date.now() / 1000) - 9999 });
    // sig は古い iat を含めて再計算
    const restaled = {
      ...stale,
      sig: signSsoPayload(
        {
          username: stale.username,
          display_name: stale.display_name,
          role: stale.role,
          iat: stale.iat,
        },
        SSO_SECRET,
      ),
    };
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(restaled));
    await expect(service.exchangeSsoTicket('t', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('role が whitelist 外なら 401', async () => {
    const { service, redis } = buildServiceWithRole();
    const bad = validPayload({ role: 'superuser' });
    const re = {
      ...bad,
      sig: signSsoPayload(
        { username: bad.username, display_name: bad.display_name, role: bad.role, iat: bad.iat },
        SSO_SECRET,
      ),
    };
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(re));
    await expect(service.exchangeSsoTicket('t', ctx)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('成功時: user upsert + role 上書き + PublicUser 返却 + audit login(sso)', async () => {
    const { service, prisma, redis, audit } = buildServiceWithRole();
    const payload = validPayload({ username: 'alice', display_name: 'Alice', role: 'planner' });
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(payload));
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: 'role-planner-id',
      code: 'planner',
      name: '予算編成者',
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-id-1',
      email: 'alice@sso.local',
      name: 'Alice',
      isActive: true,
      lastLoginAt: new Date(),
      role: { code: 'planner', name: '予算編成者' },
    } as never);

    const result = await service.exchangeSsoTicket('valid-ticket', ctx);

    expect(result.id).toBe('user-id-1');
    expect(result.email).toBe('alice@sso.local');
    expect(result.role.code).toBe('planner');
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'alice@sso.local' },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        entityType: 'sso_session',
        userId: 'user-id-1',
      }),
    );
  });
});
