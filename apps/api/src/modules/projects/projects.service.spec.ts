import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { ProjectAccessService } from '../auth/project-access.service';
import { ProjectsService } from './projects.service';

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const customerId = '01900000-0000-7000-8000-00000000ccc1';
const managerId = '01900000-0000-7000-8000-00000000ccc2';
const projectId = '01900000-0000-7000-8000-00000000bbbb';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

/** 金額は精度ロス防止のため Prisma 上 Decimal、テストではあえて 15 桁の値を使う */
const HUGE_AMOUNT = '999999999999999';

const seedProject = {
  id: projectId,
  code: '2026-001',
  name: 'サンプル工事',
  customerId,
  location: '東京都港区',
  startDate: new Date('2026-04-01T00:00:00Z'),
  endDate: new Date('2026-08-31T00:00:00Z'),
  actualEndDate: null,
  contractAmount: new Prisma.Decimal(HUGE_AMOUNT),
  status: 'in_progress' as const,
  projectType: 'private' as const,
  constructionType: 'building' as const,
  managerUserId: managerId,
  notes: null,
  createdAt: new Date('2026-05-16T00:00:00Z'),
  updatedAt: new Date('2026-05-16T00:00:00Z'),
  deletedAt: null,
};

function build() {
  const prisma = {
    $transaction: vi.fn(),
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    projectStatusHistory: {
      create: vi.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const access = {
    whereForView: vi.fn().mockResolvedValue({ deletedAt: null }),
  } as unknown as ProjectAccessService;
  return { service: new ProjectsService(prisma, audit, access), prisma, audit, access };
}

/**
 * Prisma の $transaction は (array) と (callback) の 2 オーバロードを持つ。
 * service.create / update は callback 版を使うので、ここではコールバックを
 * その場で実行して引数 tx を渡すモックを組み立てる。
 */
function mockTxCallback(prisma: PrismaService, txOverrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)({ ...prisma, ...txOverrides }) as never;
    }
    return Promise.resolve([] as never);
  });
}

// =====================================================================
describe('ProjectsService.list', () => {
  it('ABAC.whereForView を必ず合成し、検索 / status フィルタを AND 結合', async () => {
    const { service, prisma, access } = build();
    vi.mocked(access.whereForView).mockResolvedValue({
      deletedAt: null,
      OR: [{ managerUserId: actorId }],
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([1, [seedProject]] as never);

    await service.list(actorId, {
      page: 2,
      limit: 25,
      search: 'サンプル',
      status: 'in_progress',
    });

    expect(access.whereForView).toHaveBeenCalledWith(actorId);
    expect(prisma.project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: [{ managerUserId: actorId }] }),
            expect.objectContaining({
              OR: [
                { code: { contains: 'サンプル', mode: 'insensitive' } },
                { name: { contains: 'サンプル', mode: 'insensitive' } },
              ],
            }),
            { status: 'in_progress' },
          ]),
        }),
      }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25, orderBy: { code: 'asc' } }),
    );
  });

  it('DTO の contractAmount は Decimal -> string で精度ロスなし', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.$transaction).mockResolvedValue([1, [seedProject]] as never);
    const res = await service.list(actorId, { page: 1, limit: 50 });
    expect(res.items[0]?.contractAmount).toBe(HUGE_AMOUNT);
    // number に丸めるとここで桁落ちが起きる -- string で来ていることを保証
    expect(typeof res.items[0]?.contractAmount).toBe('string');
  });
});

// =====================================================================
describe('ProjectsService.getById', () => {
  it('論理削除済みは NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    await expect(service.getById(projectId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it('date 系は ISO 日付 (YYYY-MM-DD) で返る', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    const dto = await service.getById(projectId);
    expect(dto.startDate).toBe('2026-04-01');
    expect(dto.endDate).toBe('2026-08-31');
    expect(dto.actualEndDate).toBeNull();
  });
});

// =====================================================================
describe('ProjectsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('status が初期値 (bidding) のままなら status_history は INSERT しない', async () => {
    const { service, prisma, audit } = build();
    const txHistoryCreate = vi.fn().mockResolvedValue(undefined);
    const txProjectCreate = vi.fn().mockResolvedValue({ ...seedProject, status: 'bidding' });
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: { create: txProjectCreate },
        projectStatusHistory: { create: txHistoryCreate },
      }) as never;
    });

    const dto = await service.create({ code: '2026-010', name: '新規', customerId }, actorId, ctx);

    expect(dto.code).toBe('2026-001'); // seedProject ベース
    expect(txHistoryCreate).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entityType: 'projects' }),
    );
  });

  it('status を bidding 以外で指定した場合は from=null, to=指定値 で履歴 INSERT', async () => {
    const { service, prisma } = build();
    const txHistoryCreate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: {
          create: vi.fn().mockResolvedValue({ ...seedProject, status: 'in_progress' }),
        },
        projectStatusHistory: { create: txHistoryCreate },
      }) as never;
    });

    await service.create(
      {
        code: '2026-011',
        name: '新規',
        customerId,
        status: 'in_progress',
        statusReason: '受注確定',
      },
      actorId,
      ctx,
    );

    expect(txHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: null,
          toStatus: 'in_progress',
          changedById: actorId,
          reason: '受注確定',
        }),
      }),
    );
  });

  it('code 重複 (P2002) は ConflictException(PROJECT_CODE_TAKEN)', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) },
        projectStatusHistory: { create: vi.fn() },
      }) as never;
    });

    await expect(
      service.create({ code: '2026-001', name: 'dup', customerId }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('FK 違反 (P2003) は UnprocessableEntityException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: { create: vi.fn().mockRejectedValue({ code: 'P2003' }) },
        projectStatusHistory: { create: vi.fn() },
      }) as never;
    });
    await expect(
      service.create({ code: '2026-099', name: 'x', customerId }, actorId, ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

// =====================================================================
describe('ProjectsService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('status を変更した場合は from=before.status, to=after.status で履歴 INSERT', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    const txHistoryCreate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: {
          update: vi.fn().mockResolvedValue({ ...seedProject, status: 'completed' }),
        },
        projectStatusHistory: { create: txHistoryCreate },
      }) as never;
    });

    await service.update(projectId, { status: 'completed', statusReason: '竣工' }, actorId, ctx);

    expect(txHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId,
          fromStatus: 'in_progress', // seedProject.status
          toStatus: 'completed',
          changedById: actorId,
          reason: '竣工',
        }),
      }),
    );
  });

  it('status を指定しても変更がなければ履歴 INSERT は走らない', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    const txHistoryCreate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.resolve([] as never);
      return (arg as (tx: unknown) => unknown)({
        project: { update: vi.fn().mockResolvedValue(seedProject) },
        projectStatusHistory: { create: txHistoryCreate },
      }) as never;
    });

    await service.update(projectId, { status: 'in_progress' }, actorId, ctx);
    expect(txHistoryCreate).not.toHaveBeenCalled();
  });

  it('before / after を audit にスナップショットし、contractAmount は string', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    const updated = {
      ...seedProject,
      name: '更新後',
      contractAmount: new Prisma.Decimal('123456789012345'),
    };
    mockTxCallback(prisma, {
      project: { update: vi.fn().mockResolvedValue(updated) },
      projectStatusHistory: { create: vi.fn() },
    });

    await service.update(projectId, { name: '更新後' }, actorId, ctx);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        before: expect.objectContaining({
          name: 'サンプル工事',
          contractAmount: HUGE_AMOUNT,
        }),
        after: expect.objectContaining({
          name: '更新後',
          contractAmount: '123456789012345',
        }),
      }),
    );
  });

  it('対象 project がない (論理削除済み) と NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    await expect(service.update(projectId, { name: 'x' }, actorId, ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('code 重複 (P2002) は ConflictException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    mockTxCallback(prisma, {
      project: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) },
      projectStatusHistory: { create: vi.fn() },
    });
    await expect(
      service.update(projectId, { code: '2026-001' }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('managerUserId に null を渡すと disconnect される', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    const txUpdate = vi.fn().mockResolvedValue({ ...seedProject, managerUserId: null });
    mockTxCallback(prisma, {
      project: { update: txUpdate },
      projectStatusHistory: { create: vi.fn() },
    });
    await service.update(projectId, { managerUserId: null }, actorId, ctx);
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ manager: { disconnect: true } }),
      }),
    );
  });
});

// =====================================================================
describe('ProjectsService.softDelete', () => {
  it('deletedAt をセットし audit.delete を記録', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(seedProject as never);
    vi.mocked(prisma.project.update).mockResolvedValue({} as never);

    await service.softDelete(projectId, actorId, ctx);

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: projectId },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityType: 'projects',
        entityId: projectId,
        before: expect.objectContaining({ code: '2026-001' }),
      }),
    );
  });

  it('論理削除済みは NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    await expect(service.softDelete(projectId, actorId, ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
