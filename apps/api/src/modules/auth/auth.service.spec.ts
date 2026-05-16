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

  return { service: new AuthService(prisma, throttle, audit), prisma, throttle, audit };
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
