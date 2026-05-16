import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import { PROJECT_ACCESS_KEY } from './project-access.decorator';
import { ProjectAccessGuard } from './project-access.guard';
import type { ProjectAccessService } from './project-access.service';

const USER = '01900000-0000-7000-8000-0000000000aa';
const PROJ = '01900000-0000-7000-8000-0000000000bb';

const buildReq = (overrides: Partial<{ userId: string; projectId: string }> = {}) =>
  ({
    session:
      'userId' in overrides
        ? overrides.userId
          ? { userId: overrides.userId }
          : undefined
        : { userId: USER },
    params:
      'projectId' in overrides
        ? overrides.projectId
          ? { id: overrides.projectId }
          : {}
        : { id: PROJ },
    headers: { 'user-agent': 'vitest' },
    ip: '127.0.0.1',
  }) as unknown;

const ctxFor = (req: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

function buildGuard(opts: { mode?: 'view' | 'edit'; canView?: boolean; canEdit?: boolean }) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.mode),
  } as unknown as Reflector;
  const access = {
    canView: vi.fn().mockResolvedValue(opts.canView ?? false),
    canEdit: vi.fn().mockResolvedValue(opts.canEdit ?? false),
  } as unknown as ProjectAccessService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { guard: new ProjectAccessGuard(reflector, access, audit), access, audit, reflector };
}

describe('ProjectAccessGuard', () => {
  it('デコレータ未付与 (mode=undefined) は素通り、access も audit も呼ばない', async () => {
    const { guard, access, audit } = buildGuard({});
    await expect(guard.canActivate(ctxFor(buildReq()))).resolves.toBe(true);
    expect(access.canView).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('view モード + canView=true は通過 (audit なし)', async () => {
    const { guard, access, audit } = buildGuard({ mode: 'view', canView: true });
    await expect(guard.canActivate(ctxFor(buildReq()))).resolves.toBe(true);
    expect(access.canView).toHaveBeenCalledWith(USER, PROJ);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('edit モード + canEdit=false は ForbiddenException + access_denied 監査', async () => {
    const { guard, access, audit } = buildGuard({ mode: 'edit', canEdit: false });
    await expect(guard.canActivate(ctxFor(buildReq()))).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.canEdit).toHaveBeenCalledWith(USER, PROJ);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        userId: USER,
        entityType: 'projects',
        entityId: PROJ,
        after: expect.objectContaining({ mode: 'edit', projectId: PROJ, userId: USER }),
        ipAddress: '127.0.0.1',
      }),
    );
  });

  it('セッション無し (未ログイン) は Forbidden + missing_context 監査', async () => {
    const { guard, audit } = buildGuard({ mode: 'view', canView: true });
    await expect(guard.canActivate(ctxFor(buildReq({ userId: undefined })))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        userId: null,
        after: expect.objectContaining({ reason: 'missing_context' }),
      }),
    );
  });

  it('params.id 欠落も Forbidden + missing_context', async () => {
    const { guard, audit } = buildGuard({ mode: 'view', canView: true });
    await expect(
      guard.canActivate(ctxFor(buildReq({ projectId: undefined }))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        entityId: null,
        after: expect.objectContaining({ reason: 'missing_context' }),
      }),
    );
  });

  it('reflector は handler + class スコープで PROJECT_ACCESS_KEY を取りに行く', async () => {
    const { guard, reflector } = buildGuard({ mode: 'view', canView: true });
    await guard.canActivate(ctxFor(buildReq()));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PROJECT_ACCESS_KEY, expect.any(Array));
  });
});
