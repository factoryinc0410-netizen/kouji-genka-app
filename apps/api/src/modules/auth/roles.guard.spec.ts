import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ROLES_METADATA_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

const reqWithSession = (userId?: string) =>
  ({
    session: userId ? { userId } : undefined,
    headers: { 'user-agent': 'vitest' },
    ip: '127.0.0.1',
    originalUrl: '/api/v1/users',
    path: '/users',
    method: 'GET',
    route: { path: '/' },
  }) as unknown;

const ctxFor = (req: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

function buildGuard(roles: string[] | undefined, user: { code: string } | null) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user ? { role: user } : null) },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { guard: new RolesGuard(reflector, prisma, audit), audit };
}

describe('RolesGuard', () => {
  it('@Roles が無い場合は素通り', async () => {
    const { guard } = buildGuard(undefined, null);
    await expect(guard.canActivate(ctxFor(reqWithSession('u1')))).resolves.toBe(true);
  });

  it('admin 必須に対し admin ロールは通過', async () => {
    const { guard } = buildGuard(['admin'], { code: 'admin' });
    await expect(guard.canActivate(ctxFor(reqWithSession('u1')))).resolves.toBe(true);
  });

  it('未認証は ForbiddenException', async () => {
    const { guard, audit } = buildGuard(['admin'], null);
    await expect(guard.canActivate(ctxFor(reqWithSession(undefined)))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('権限不足は ForbiddenException + access_denied 監査', async () => {
    const { guard, audit } = buildGuard(['admin'], { code: 'viewer' });
    await expect(guard.canActivate(ctxFor(reqWithSession('u1')))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        userId: 'u1',
        after: expect.objectContaining({ requiredRoles: ['admin'], actualRole: 'viewer' }),
      }),
    );
  });

  it('該当 metadata key で reflector に問い合わせる', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector, {} as PrismaService, {} as AuditService);
    void guard.canActivate(ctxFor(reqWithSession('u1')));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_METADATA_KEY, expect.any(Array));
  });
});
