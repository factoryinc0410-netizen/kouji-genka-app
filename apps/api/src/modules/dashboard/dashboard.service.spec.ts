import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ProjectAccessService } from '../auth/project-access.service';
import { computeCoverage, DashboardService } from './dashboard.service';

const actorId = '01900000-0000-7000-8000-000000000aaa';
const projectIdA = '01900000-0000-7000-8000-00000000aaa1';
const projectIdB = '01900000-0000-7000-8000-00000000aaa2';
const projectIdC = '01900000-0000-7000-8000-00000000aaa3';
const projectIdD = '01900000-0000-7000-8000-00000000aaa4';
const projectIdE = '01900000-0000-7000-8000-00000000aaa5';
const budgetIdA = '01900000-0000-7000-8000-00000000bbb1';
const budgetIdB = '01900000-0000-7000-8000-00000000bbb2';
const otherUserId = '01900000-0000-7000-8000-000000000bbb';

const VISIBLE_ADMIN = { deletedAt: null };
const VISIBLE_PLANNER = {
  deletedAt: null,
  OR: [{ managerUserId: actorId }],
};

function build(role: 'admin' | 'planner' = 'admin') {
  const prisma = {
    project: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: { code: role } }),
    },
  } as unknown as PrismaService;
  const access = {
    whereForView: vi.fn().mockResolvedValue(role === 'admin' ? VISIBLE_ADMIN : VISIBLE_PLANNER),
  } as unknown as ProjectAccessService;
  return { service: new DashboardService(prisma, access), prisma, access };
}

// =====================================================================
// computeCoverage (pure helper) を直接検証
// =====================================================================
describe('computeCoverage', () => {
  it('普通の % (50,000,000 / 100,000,000 = 50.00%)', () => {
    const r = computeCoverage('100000000', '50000000');
    expect(r.coverageBps).toBe('5000');
    expect(r.alertLevel).toBe('healthy');
  });

  it('caution (85.00%)', () => {
    const r = computeCoverage('100000000', '85000000');
    expect(r.coverageBps).toBe('8500');
    expect(r.alertLevel).toBe('caution');
  });

  it('warning (96.00%)', () => {
    const r = computeCoverage('100000000', '96000000');
    expect(r.coverageBps).toBe('9600');
    expect(r.alertLevel).toBe('warning');
  });

  it('over (105.00%)', () => {
    const r = computeCoverage('100000000', '105000000');
    expect(r.coverageBps).toBe('10500');
    expect(r.alertLevel).toBe('over');
  });

  it('contract=0 → null / unknown (0 除算ガード)', () => {
    const r = computeCoverage('0', '50000000');
    expect(r.coverageBps).toBeNull();
    expect(r.alertLevel).toBe('unknown');
  });

  it('budget=null → null / unknown', () => {
    const r = computeCoverage('100000000', null);
    expect(r.coverageBps).toBeNull();
    expect(r.alertLevel).toBe('unknown');
  });

  it('境界値 80.00% は caution (8000 bps), 79.99% は healthy', () => {
    expect(computeCoverage('10000', '8000').alertLevel).toBe('caution');
    expect(computeCoverage('10000', '7999').alertLevel).toBe('healthy');
  });

  it('境界値 95.00% は warning, 94.99% は caution', () => {
    expect(computeCoverage('10000', '9500').alertLevel).toBe('warning');
    expect(computeCoverage('10000', '9499').alertLevel).toBe('caution');
  });

  it('境界値 100.00% は over', () => {
    expect(computeCoverage('10000', '10000').alertLevel).toBe('over');
  });

  it('15 桁同士で桁あふれしない (999兆 円規模)', () => {
    // 9.99 * 10^14 ÷ 9.99 * 10^14 = 100% = 10000 bps
    const r = computeCoverage('999999999999999', '999999999999999');
    expect(r.coverageBps).toBe('10000');
    expect(r.alertLevel).toBe('over');
  });

  it('Decimal で半端を切り上げ (HALF_UP)', () => {
    // 1 / 3 * 10000 = 3333.33... → 3333
    expect(computeCoverage('3', '1').coverageBps).toBe('3333');
    // 2 / 3 * 10000 = 6666.66... → 6667
    expect(computeCoverage('3', '2').coverageBps).toBe('6667');
  });
});

// =====================================================================
// DashboardService.getSummary 統合
// =====================================================================
describe('DashboardService.getSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('status counts は 5 status すべてキーを持ち、欠落 status は 0 で埋まる', async () => {
    const { service, prisma, access } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([
      { status: 'in_progress', _count: { _all: 12 } },
      { status: 'completed', _count: { _all: 2 } },
    ] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    const res = await service.getSummary(actorId);

    expect(res.projectStatusCounts).toEqual({
      bidding: 0,
      in_progress: 12,
      completed: 2,
      billing: 0,
      closed: 0,
    });
    // ABAC where が groupBy に伝播
    expect(access.whereForView).toHaveBeenCalledWith(actorId);
    expect(prisma.project.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: VISIBLE_ADMIN }),
    );
  });

  it('planner の場合は whereForView が絞り込まれ、その where が全クエリに伝播', async () => {
    const { service, prisma, access } = build('planner');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    await service.getSummary(actorId);

    expect(access.whereForView).toHaveBeenCalledWith(actorId);
    expect(prisma.project.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: VISIBLE_PLANNER }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: VISIBLE_PLANNER }),
    );
    // pending 系の where に project = visibleWhere が入る
    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'pending_approval',
          project: VISIBLE_PLANNER,
          // 非 admin は submittedById で絞り込み
          submittedById: actorId,
        }),
      }),
    );
  });

  it('admin の pending は submittedById フィルタなし、audience="admin"', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(7);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    const res = await service.getSummary(actorId);

    expect(res.pendingApproval.audience).toBe('admin');
    expect(res.pendingApproval.total).toBe(7);
    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ submittedById: expect.anything() }),
      }),
    );
  });

  it('pending items の整形: submitter JOIN / ageSeconds 計算 / totalAmount は string', async () => {
    const { service, prisma } = build('admin');
    const submittedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000); // 3 日前
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      {
        id: budgetIdA,
        projectId: projectIdA,
        version: 2,
        totalAmount: new Prisma.Decimal('123456789012345'),
        submittedById: otherUserId,
        submittedAt,
        project: { code: '2026-001', name: 'XX邸' },
        submitter: { id: otherUserId, name: '山田太郎' },
      },
    ] as never);
    vi.mocked(prisma.budget.count).mockResolvedValue(1);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    const res = await service.getSummary(actorId);
    expect(res.pendingApproval.items).toHaveLength(1);
    const item = res.pendingApproval.items[0];
    expect(item?.totalAmount).toBe('123456789012345'); // string、Number 変換なし
    expect(item?.submittedByName).toBe('山田太郎');
    expect(item?.projectCode).toBe('2026-001');
    // 3 日 ± 数秒の幅で確認
    const expected = 3 * 24 * 3600;
    expect(item?.ageSeconds).toBeGreaterThanOrEqual(expected - 5);
    expect(item?.ageSeconds).toBeLessThanOrEqual(expected + 5);
  });

  it('submitter が削除済 (null) → submittedByName=null、ageSeconds=0', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      {
        id: budgetIdA,
        projectId: projectIdA,
        version: 1,
        totalAmount: new Prisma.Decimal('1000'),
        submittedById: null,
        submittedAt: null,
        project: { code: '2026-099', name: 'orphan' },
        submitter: null,
      },
    ] as never);
    vi.mocked(prisma.budget.count).mockResolvedValue(1);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    const res = await service.getSummary(actorId);
    expect(res.pendingApproval.items[0]?.submittedByName).toBeNull();
    expect(res.pendingApproval.items[0]?.ageSeconds).toBe(0);
  });

  it('coverage: 各 alertLevel が分類され、alertCounts に集計される', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      // healthy: 50%
      makeProject(projectIdA, '2026-A', 'A邸', '100000000', '50000000'),
      // caution: 85%
      makeProject(projectIdB, '2026-B', 'B邸', '100000000', '85000000'),
      // warning: 96%
      makeProject(projectIdC, '2026-C', 'C邸', '100000000', '96000000'),
      // over: 105%
      makeProject(projectIdD, '2026-D', 'D邸', '100000000', '105000000'),
      // unknown: budget なし
      makeProject(projectIdE, '2026-E', 'E邸', '100000000', null),
    ] as never);

    const res = await service.getSummary(actorId);

    expect(res.budgetCoverage.alertCounts).toEqual({
      healthy: 1,
      caution: 1,
      warning: 1,
      over: 1,
      unknown: 1,
    });
  });

  it('coverage: items は over → warning → caution → healthy → unknown の順', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    // わざと逆順に渡す
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      makeProject(projectIdA, '2026-A', 'A', '100000000', '30000000'), // healthy
      makeProject(projectIdE, '2026-E', 'E', '100000000', null), // unknown
      makeProject(projectIdB, '2026-B', 'B', '100000000', '90000000'), // caution
      makeProject(projectIdD, '2026-D', 'D', '100000000', '120000000'), // over
      makeProject(projectIdC, '2026-C', 'C', '100000000', '98000000'), // warning
    ] as never);

    const res = await service.getSummary(actorId);
    expect(res.budgetCoverage.items.map((i) => i.alertLevel)).toEqual([
      'over',
      'warning',
      'caution',
      'healthy',
      'unknown',
    ]);
  });

  it('coverage: 同じ alertLevel 内では bps desc (より逼迫が先)', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      // 2 件とも over、120% > 105%
      makeProject(projectIdA, 'A', 'A', '100000000', '105000000'), // 10500 bps
      makeProject(projectIdB, 'B', 'B', '100000000', '120000000'), // 12000 bps
    ] as never);

    const res = await service.getSummary(actorId);
    expect(res.budgetCoverage.items.map((i) => i.coverageBps)).toEqual(['12000', '10500']);
  });

  it('coverage: items は最大 10 件、alertCounts は全件分', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    const many = Array.from({ length: 25 }, (_, i) =>
      makeProject(
        `01900000-0000-7000-8000-${i.toString().padStart(12, '0')}`,
        `code-${i}`,
        `name-${i}`,
        '100000000',
        `${i + 1}0000000`, // 10%, 20%, ..., 250%
      ),
    );
    vi.mocked(prisma.project.findMany).mockResolvedValue(many as never);

    const res = await service.getSummary(actorId);
    expect(res.budgetCoverage.items.length).toBe(10);
    // 25 件全件が alertCounts に反映
    const sum = Object.values(res.budgetCoverage.alertCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(25);
  });

  it('generatedAt は ISO 8601 datetime', async () => {
    const { service, prisma } = build('admin');
    vi.mocked(prisma.project.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.count).mockResolvedValue(0);
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);

    const res = await service.getSummary(actorId);
    expect(res.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// helper -------------------------------------------------------------
function makeProject(
  id: string,
  code: string,
  name: string,
  contractAmount: string,
  budgetTotal: string | null,
) {
  return {
    id,
    code,
    name,
    status: 'in_progress',
    contractAmount: new Prisma.Decimal(contractAmount),
    budgets:
      budgetTotal === null ? [] : [{ id: budgetIdB, totalAmount: new Prisma.Decimal(budgetTotal) }],
  };
}
