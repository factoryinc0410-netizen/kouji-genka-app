import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ProjectPermissionsService } from './permissions.service';

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const projectId = '01900000-0000-7000-8000-00000000bbbb';
const targetUserId = '01900000-0000-7000-8000-00000000cccc';
const uppId = '01900000-0000-7000-8000-00000000dddd';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const seedUpp = {
  id: uppId,
  userId: targetUserId,
  projectId,
  canView: true,
  canEdit: false,
  createdAt: new Date('2026-05-16T00:00:00Z'),
  updatedAt: new Date('2026-05-16T00:00:00Z'),
  user: {
    id: targetUserId,
    email: 'planner@example.com',
    name: '担当 太郎',
    isActive: true,
    role: { id: 'r', code: 'planner' as const, name: '予算編成' },
  },
};

function build() {
  const prisma = {
    userProjectPermission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new ProjectPermissionsService(prisma, audit), prisma, audit };
}

// =====================================================================
describe('ProjectPermissionsService.list', () => {
  it('指定 project の UPP を user 込みで返し、ロール情報も整形', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.userProjectPermission.findMany).mockResolvedValue([seedUpp] as never);

    const res = await service.list(projectId);

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: uppId,
      userId: targetUserId,
      projectId,
      canView: true,
      canEdit: false,
      user: {
        email: 'planner@example.com',
        role: { code: 'planner', name: '予算編成' },
      },
    });
    expect(prisma.userProjectPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId },
        include: { user: { include: { role: true } } },
      }),
    );
  });
});

// =====================================================================
describe('ProjectPermissionsService.grant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('canView/canEdit のデフォルト (true/false) で作成し、audit.permission_change に after を残す', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.userProjectPermission.create).mockResolvedValue(seedUpp as never);

    const dto = await service.grant(projectId, { userId: targetUserId }, actorId, ctx);

    expect(dto.canView).toBe(true);
    expect(dto.canEdit).toBe(false);
    expect(prisma.userProjectPermission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId,
          userId: targetUserId,
          canView: true,
          canEdit: false,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permission_change',
        userId: actorId,
        entityType: 'user_project_permissions',
        entityId: uppId,
        after: expect.objectContaining({
          userId: targetUserId,
          projectId,
          canView: true,
          canEdit: false,
        }),
      }),
    );
  });

  it('canView=false, canEdit=true を明示的に渡せる (API は中立)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.userProjectPermission.create).mockResolvedValue({
      ...seedUpp,
      canView: false,
      canEdit: true,
    } as never);

    const dto = await service.grant(
      projectId,
      { userId: targetUserId, canView: false, canEdit: true },
      actorId,
      ctx,
    );
    expect(dto.canEdit).toBe(true);
    expect(dto.canView).toBe(false);
  });

  it('重複 (P2002) は ConflictException(PROJECT_PERMISSION_EXISTS)', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.userProjectPermission.create).mockRejectedValue({ code: 'P2002' });

    await expect(
      service.grant(projectId, { userId: targetUserId }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('FK 違反 (P2003) は UnprocessableEntityException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.userProjectPermission.create).mockRejectedValue({ code: 'P2003' });

    await expect(
      service.grant(projectId, { userId: targetUserId }, actorId, ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

// =====================================================================
describe('ProjectPermissionsService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('既存 UPP を更新し、before/after を audit に残す', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.userProjectPermission.findUnique).mockResolvedValue(seedUpp as never);
    vi.mocked(prisma.userProjectPermission.update).mockResolvedValue({
      ...seedUpp,
      canEdit: true,
    } as never);

    const dto = await service.update(projectId, targetUserId, { canEdit: true }, actorId, ctx);

    expect(dto.canEdit).toBe(true);
    expect(prisma.userProjectPermission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_projectId: { userId: targetUserId, projectId } },
        data: expect.objectContaining({ canEdit: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permission_change',
        before: expect.objectContaining({ canEdit: false }),
        after: expect.objectContaining({ canEdit: true }),
      }),
    );
  });

  it('対象 UPP がない場合は NotFoundException (DB 更新も走らない)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.userProjectPermission.findUnique).mockResolvedValue(null);
    await expect(
      service.update(projectId, targetUserId, { canEdit: true }, actorId, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userProjectPermission.update).not.toHaveBeenCalled();
  });
});

// =====================================================================
describe('ProjectPermissionsService.revoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('対象 UPP を削除し、audit に before を残す', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.userProjectPermission.findUnique).mockResolvedValue(seedUpp as never);
    vi.mocked(prisma.userProjectPermission.delete).mockResolvedValue({} as never);

    await service.revoke(projectId, targetUserId, actorId, ctx);

    expect(prisma.userProjectPermission.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_projectId: { userId: targetUserId, projectId } },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permission_change',
        before: expect.objectContaining({ userId: targetUserId, projectId }),
      }),
    );
  });

  it('存在しなければ NotFoundException で削除も走らない', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.userProjectPermission.findUnique).mockResolvedValue(null);
    await expect(service.revoke(projectId, targetUserId, actorId, ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.userProjectPermission.delete).not.toHaveBeenCalled();
  });
});
