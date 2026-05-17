import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BudgetHistoryService } from './budget-history.service';

const projectId = '01900000-0000-7000-8000-00000000bbbb';
const budgetId = '01900000-0000-7000-8000-00000000cccc';
const newBudgetId = '01900000-0000-7000-8000-00000000dddd';
const userAlice = { id: '01900000-0000-7000-8000-000000aaaaaa', name: 'Alice' };
const userBob = { id: '01900000-0000-7000-8000-000000bbbbbb', name: 'Bob' };

function build() {
  const prisma = {
    budget: { findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() },
  } as unknown as PrismaService;
  return { service: new BudgetHistoryService(prisma), prisma };
}

/** audit_logs レコードの最小限の builder (テスト用) */
function log(
  overrides: Partial<{
    id: bigint;
    occurredAt: Date;
    action: 'create' | 'update' | 'delete' | 'export';
    entityId: string;
    user: { id: string; name: string } | null;
    after: Record<string, unknown> | null;
  }>,
) {
  return {
    id: overrides.id ?? 1n,
    userId: overrides.user?.id ?? null,
    occurredAt: overrides.occurredAt ?? new Date('2026-05-17T10:00:00Z'),
    action: overrides.action ?? 'update',
    entityType: 'budgets',
    entityId: overrides.entityId ?? budgetId,
    before: null,
    after: overrides.after ?? null,
    ipAddress: null,
    userAgent: null,
    user: overrides.user ?? null,
  };
}

describe('BudgetHistoryService.listHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('予算が存在しないと NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);
    await expect(service.listHistory(projectId, budgetId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create → submit → reject(理由付) → submit → approve を時系列で正規化', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 1n,
        action: 'create',
        occurredAt: new Date('2026-05-17T10:00:00Z'),
        user: userAlice,
        after: { version: 1, status: 'draft' },
      }),
      log({
        id: 2n,
        action: 'update',
        occurredAt: new Date('2026-05-17T11:00:00Z'),
        user: userAlice,
        after: { workflowAction: 'submit', status: 'pending_approval' },
      }),
      log({
        id: 3n,
        action: 'update',
        occurredAt: new Date('2026-05-17T12:00:00Z'),
        user: userBob,
        after: { workflowAction: 'reject', reason: '単価を再確認ください', status: 'draft' },
      }),
      log({
        id: 4n,
        action: 'update',
        occurredAt: new Date('2026-05-17T13:00:00Z'),
        user: userAlice,
        after: { workflowAction: 'submit', status: 'pending_approval' },
      }),
      log({
        id: 5n,
        action: 'update',
        occurredAt: new Date('2026-05-17T14:00:00Z'),
        user: userBob,
        after: { workflowAction: 'approve', status: 'approved' },
      }),
    ] as never);
    // 改定先 (revise_from) はなし
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([] as never);

    const events = await service.listHistory(projectId, budgetId);
    expect(events.map((e) => e.eventType)).toEqual([
      'create',
      'submit',
      'reject',
      'submit',
      'approve',
    ]);
    // id は string 化
    expect(events[0]?.id).toBe('1');
    // reject の reason が抽出される
    expect(events[2]?.reason).toBe('単価を再確認ください');
    expect(events[2]?.actor).toEqual({ id: userBob.id, name: userBob.name });
    // create の meta に version/status が乗る
    expect(events[0]?.meta).toEqual({ version: 1, status: 'draft' });
  });

  it('純粋な PATCH (workflowAction なしの update) は履歴に含まれない', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 1n,
        action: 'create',
        user: userAlice,
        occurredAt: new Date('2026-05-17T10:00:00Z'),
      }),
      // タイトル変更等の純粋編集
      log({
        id: 2n,
        action: 'update',
        user: userAlice,
        occurredAt: new Date('2026-05-17T10:30:00Z'),
        after: { title: '改名後' },
      }),
      log({
        id: 3n,
        action: 'update',
        user: userAlice,
        occurredAt: new Date('2026-05-17T11:00:00Z'),
        after: { workflowAction: 'submit', status: 'pending_approval' },
      }),
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([] as never);

    const events = await service.listHistory(projectId, budgetId);
    expect(events.map((e) => e.eventType)).toEqual(['create', 'submit']);
  });

  it('action=export は export イベントとして拾われ、meta に format/totalAmount を含む', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 7n,
        action: 'export',
        user: userAlice,
        occurredAt: new Date('2026-05-17T15:00:00Z'),
        after: { format: 'xlsx', version: 1, status: 'approved', totalAmount: '2237100' },
      }),
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([] as never);

    const events = await service.listHistory(projectId, budgetId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('export');
    expect(events[0]?.meta).toMatchObject({ format: 'xlsx', totalAmount: '2237100' });
  });

  it('削除済ユーザ (user=null) は actor.name が null', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 1n,
        action: 'update',
        user: null,
        after: { workflowAction: 'approve' },
      }),
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([] as never);

    const events = await service.listHistory(projectId, budgetId);
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toEqual({ id: null, name: null });
  });

  it('旧版 (superseded) は revise イベント (workflowAction=revise の update) として記録される', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 1n,
        action: 'create',
        user: userAlice,
        occurredAt: new Date('2026-05-17T10:00:00Z'),
      }),
      log({
        id: 2n,
        action: 'update',
        user: userBob,
        occurredAt: new Date('2026-05-17T15:00:00Z'),
        after: { workflowAction: 'revise', status: 'superseded' },
      }),
    ] as never);
    // sourceBudgetId 逆引きで新 draft を発見
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 3n,
        action: 'create',
        entityId: newBudgetId,
        user: userBob,
        occurredAt: new Date('2026-05-17T15:00:01Z'),
        after: { workflowAction: 'revise', sourceBudgetId: budgetId, version: 2, status: 'draft' },
      }),
    ] as never);

    const events = await service.listHistory(projectId, budgetId);
    // [create, revise (旧版側 update), revise (逆引き=新版 id を指す)] の 3 件
    expect(events.map((e) => e.eventType)).toEqual(['create', 'revise', 'revise']);
    const lastRevise = events[2];
    // 逆引き分は newBudgetId で新版を指す
    expect(lastRevise?.newBudgetId).toBe(newBudgetId);
  });

  it('新 draft 側 (revise で生まれた予算) を起点に呼ぶと revise_from イベントを返す', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: newBudgetId } as never);
    // direct: 新 draft の create (workflowAction=revise + sourceBudgetId 付き)
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 3n,
        action: 'create',
        entityId: newBudgetId,
        user: userBob,
        occurredAt: new Date('2026-05-17T15:00:01Z'),
        after: { workflowAction: 'revise', sourceBudgetId: budgetId, version: 2 },
      }),
    ] as never);
    // 新 draft を起点にした更に新しい版はないので逆引きは空
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([] as never);

    const events = await service.listHistory(projectId, newBudgetId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('revise_from');
    expect(events[0]?.sourceBudgetId).toBe(budgetId);
  });

  it('occurredAt 昇順で統合ソートされる (direct と revise_from が混ざっても順序が崩れない)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: budgetId } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({ id: 1n, action: 'create', occurredAt: new Date('2026-05-17T10:00:00Z') }),
      log({
        id: 2n,
        action: 'update',
        occurredAt: new Date('2026-05-17T14:00:00Z'),
        after: { workflowAction: 'revise' },
      }),
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      log({
        id: 3n,
        action: 'create',
        entityId: newBudgetId,
        occurredAt: new Date('2026-05-17T12:00:00Z'),
        after: { workflowAction: 'revise', sourceBudgetId: budgetId },
      }),
    ] as never);

    const events = await service.listHistory(projectId, budgetId);
    expect(events.map((e) => e.occurredAt)).toEqual([
      '2026-05-17T10:00:00.000Z',
      '2026-05-17T12:00:00.000Z',
      '2026-05-17T14:00:00.000Z',
    ]);
  });
});
