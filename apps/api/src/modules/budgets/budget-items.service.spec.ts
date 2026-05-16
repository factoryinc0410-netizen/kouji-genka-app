import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { BudgetItemsService } from './budget-items.service';

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const projectId = '01900000-0000-7000-8000-00000000bbbb';
const budgetId = '01900000-0000-7000-8000-00000000cccc';
const itemId = '01900000-0000-7000-8000-00000000dddd';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const seedItem = {
  id: itemId,
  budgetId,
  parentId: null,
  level: 0,
  displayOrder: 1000,
  kind: 'detail' as const,
  code: '1',
  name: 'サンプル',
  spec: null,
  unit: '式',
  costElement: 'expense' as const,
  quantity: new Prisma.Decimal('1'),
  unitPrice: new Prisma.Decimal('500000'),
  amount: new Prisma.Decimal('500000'),
  notes: null,
  lockVersion: 3,
  createdAt: new Date('2026-05-16T00:00:00Z'),
  updatedAt: new Date('2026-05-16T00:00:00Z'),
  deletedAt: null,
};

/**
 * tx callback を即実行するモック。tx.* には override を渡せる。
 */
function makeTxRunner(prisma: PrismaService, overrides: Record<string, unknown>): void {
  vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
    if (typeof arg !== 'function') return Promise.resolve([] as never);
    return (arg as (tx: unknown) => unknown)({ ...prisma, ...overrides }) as never;
  });
}

function build() {
  const prisma = {
    $transaction: vi.fn(),
    // ensureBudgetEditable で status を見るので draft を返す。
    // 非 draft をテストする場合は各テストで mockResolvedValueOnce で上書きする。
    budget: { findFirst: vi.fn().mockResolvedValue({ id: budgetId, status: 'draft' }) },
    budgetItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new BudgetItemsService(prisma, audit), prisma, audit };
}

// =====================================================================
describe('BudgetItemsService.listTree / getById', () => {
  it('listTree は level → display_order 順で返し、すべて string 金額', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budgetItem.findMany).mockResolvedValue([seedItem] as never);
    const res = await service.listTree(projectId, budgetId);
    expect(res.total).toBe(1);
    expect(res.items[0]?.amount).toBe('500000');
    expect(res.items[0]?.quantity).toBe('1');
    expect(prisma.budgetItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { budgetId, deletedAt: null },
        orderBy: [{ level: 'asc' }, { displayOrder: 'asc' }],
      }),
    );
  });

  it('getById で見つからなければ NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budgetItem.findFirst).mockResolvedValue(null);
    await expect(service.getById(projectId, budgetId, itemId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// =====================================================================
describe('BudgetItemsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parentId 未指定 + displayOrder 未指定なら兄弟 max+1000 / level=0', async () => {
    const { service, prisma } = build();
    const txCreate = vi.fn().mockResolvedValue({ ...seedItem, displayOrder: 4000 });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn(), // 親探索は parentId 未指定なら呼ばれない
        aggregate: vi.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(0) },
          _max: { displayOrder: 3000 },
        }),
        create: txCreate,
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { findFirst: vi.fn(), update: vi.fn() },
    });

    await service.create(
      projectId,
      budgetId,
      { kind: 'detail', name: '追加', quantity: '2', unitPrice: '100', costElement: 'material' },
      actorId,
      ctx,
    );

    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          budgetId,
          parentId: null,
          level: 0,
          displayOrder: 4000,
          kind: 'detail',
          // 葉なので amount = 2 * 100 = 200
          amount: expect.objectContaining({}),
        }),
      }),
    );
    const createdData = txCreate.mock.calls[0]?.[0]?.data as { amount: Prisma.Decimal };
    expect(createdData.amount.toString()).toBe('200');
  });

  it('葉の親 (detail) に子を追加しようとすると 422 INVALID_PARENT_KIND', async () => {
    const { service, prisma } = build();
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'parent', level: 0, kind: 'detail' }),
        aggregate: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });

    await expect(
      service.create(
        projectId,
        budgetId,
        { kind: 'detail', name: 'x', parentId: 'parent' },
        actorId,
        ctx,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('section/composite で作成すると amount は 0 で初期化される', async () => {
    const { service, prisma } = build();
    const txCreate = vi
      .fn()
      .mockResolvedValue({ ...seedItem, kind: 'section', amount: new Prisma.Decimal(0) });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(0) },
          _max: { displayOrder: null },
        }),
        create: txCreate,
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });

    await service.create(projectId, budgetId, { kind: 'section', name: 'ヘッダ' }, actorId, ctx);
    const data = txCreate.mock.calls[0]?.[0]?.data as { amount: Prisma.Decimal };
    expect(data.amount.toString()).toBe('0');
  });
});

// =====================================================================
describe('BudgetItemsService.update (楽観ロック + amount 再計算)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lockVersion 不一致なら 409 BUDGET_ITEM_VERSION_MISMATCH', async () => {
    const { service, prisma } = build();
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue({ ...seedItem, lockVersion: 5 }),
        update: vi.fn(),
        aggregate: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });
    await expect(
      service.update(projectId, budgetId, itemId, { lockVersion: 3, name: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('葉の quantity を更新すると amount = q*p で再計算され、lockVersion が +1 される', async () => {
    const { service, prisma } = build();
    const txUpdate = vi.fn().mockResolvedValue({
      ...seedItem,
      quantity: new Prisma.Decimal('3'),
      amount: new Prisma.Decimal('1500000'),
      lockVersion: 4,
    });
    const txAggregate = vi
      .fn()
      .mockResolvedValue({ _sum: { amount: new Prisma.Decimal('1500000') } });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue(seedItem),
        update: txUpdate,
        aggregate: txAggregate,
        findUnique: vi.fn().mockResolvedValue({ parentId: null }),
      },
      budget: { update: vi.fn() },
    });

    await service.update(
      projectId,
      budgetId,
      itemId,
      { lockVersion: 3, quantity: '3' },
      actorId,
      ctx,
    );

    const data = txUpdate.mock.calls[0]?.[0]?.data as {
      amount?: Prisma.Decimal;
      lockVersion: number;
    };
    // 3 * 500000 = 1,500,000
    expect(data.amount?.toString()).toBe('1500000');
    expect(data.lockVersion).toBe(4);
  });

  it('quantity / unitPrice 不変なら amount 再計算は走らず lockVersion だけ +1', async () => {
    const { service, prisma } = build();
    const txUpdate = vi.fn().mockResolvedValue({ ...seedItem, name: '更新', lockVersion: 4 });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue(seedItem),
        update: txUpdate,
        aggregate: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });

    await service.update(
      projectId,
      budgetId,
      itemId,
      { lockVersion: 3, name: '更新' },
      actorId,
      ctx,
    );
    const data = txUpdate.mock.calls[0]?.[0]?.data as {
      amount?: Prisma.Decimal;
      lockVersion: number;
    };
    expect(data.amount).toBeUndefined();
    expect(data.lockVersion).toBe(4);
  });
});

// =====================================================================
describe('BudgetItemsService.update (tree move)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parentId を別の composite に変更すると level=新親+1 + disconnect/connect', async () => {
    const { service, prisma } = build();
    const movingItem = { ...seedItem, parentId: 'old-parent', level: 1 };
    const txUpdate = vi.fn().mockResolvedValue({ ...movingItem, parentId: 'new-parent', level: 2 });
    // findFirst: 1) item 取得, 2) 新親検証
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(movingItem)
      .mockResolvedValueOnce({ id: 'new-parent', level: 1, kind: 'composite' });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst,
        update: txUpdate,
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } }),
        // isDescendant / shiftDescendantLevel 用 (子孫なし)
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ parentId: null }),
      },
      budget: { update: vi.fn() },
    });

    await service.update(
      projectId,
      budgetId,
      itemId,
      { lockVersion: 3, parentId: 'new-parent' },
      actorId,
      ctx,
    );

    const data = txUpdate.mock.calls[0]?.[0]?.data as {
      parent?: { connect?: { id: string } };
      level?: number;
    };
    expect(data.parent?.connect?.id).toBe('new-parent');
    expect(data.level).toBe(2);
  });

  it('parentId=null を渡すとルートへ移動 (level=0, parent.disconnect)', async () => {
    const { service, prisma } = build();
    const movingItem = { ...seedItem, parentId: 'old-parent', level: 2 };
    const txUpdate = vi.fn().mockResolvedValue({ ...movingItem, parentId: null, level: 0 });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValueOnce(movingItem),
        update: txUpdate,
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ parentId: null }),
      },
      budget: { update: vi.fn() },
    });
    await service.update(
      projectId,
      budgetId,
      itemId,
      { lockVersion: 3, parentId: null },
      actorId,
      ctx,
    );
    const data = txUpdate.mock.calls[0]?.[0]?.data as {
      parent?: { disconnect?: boolean };
      level?: number;
    };
    expect(data.parent).toEqual({ disconnect: true });
    expect(data.level).toBe(0);
  });

  it('自分自身を親に指定すると 422 INVALID_PARENT', async () => {
    const { service, prisma } = build();
    const movingItem = { ...seedItem, parentId: 'old-parent', level: 1 };
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(movingItem)
          .mockResolvedValueOnce({ id: itemId, level: 1, kind: 'composite' }),
        update: vi.fn(),
        aggregate: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });
    await expect(
      service.update(
        projectId,
        budgetId,
        itemId,
        { lockVersion: 3, parentId: itemId },
        actorId,
        ctx,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('葉 (detail) を親に指定すると 422 INVALID_PARENT_KIND', async () => {
    const { service, prisma } = build();
    const movingItem = { ...seedItem, parentId: 'old-parent', level: 1 };
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(movingItem)
          .mockResolvedValueOnce({ id: 'leaf-parent', level: 2, kind: 'detail' }),
        update: vi.fn(),
        aggregate: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });
    await expect(
      service.update(
        projectId,
        budgetId,
        itemId,
        { lockVersion: 3, parentId: 'leaf-parent' },
        actorId,
        ctx,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

// =====================================================================
describe('BudgetItemsService.softDelete (楽観ロック + 子持ち拒否)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lockVersion 不一致なら 409', async () => {
    const { service, prisma } = build();
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue({ ...seedItem, lockVersion: 5 }),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
        aggregate: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });
    await expect(
      service.softDelete(projectId, budgetId, itemId, 3, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('子持ちなら 422 HAS_CHILDREN で update は呼ばれない', async () => {
    const { service, prisma } = build();
    const txUpdate = vi.fn();
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue(seedItem),
        count: vi.fn().mockResolvedValue(2),
        update: txUpdate,
        aggregate: vi.fn(),
        findUnique: vi.fn(),
      },
      budget: { update: vi.fn() },
    });
    await expect(
      service.softDelete(projectId, budgetId, itemId, 3, actorId, ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('成功時は deletedAt 設定 + lockVersion +1 + rollUp 呼出', async () => {
    const { service, prisma, audit } = build();
    const txUpdate = vi.fn().mockResolvedValue({});
    const txAggregate = vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } });
    makeTxRunner(prisma, {
      budgetItem: {
        findFirst: vi.fn().mockResolvedValue(seedItem),
        count: vi.fn().mockResolvedValue(0),
        update: txUpdate,
        aggregate: txAggregate,
        findUnique: vi.fn().mockResolvedValue({ parentId: null }),
      },
      budget: { update: vi.fn() },
    });
    await service.softDelete(projectId, budgetId, itemId, 3, actorId, ctx);

    const data = txUpdate.mock.calls[0]?.[0]?.data as { deletedAt: Date; lockVersion: number };
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.lockVersion).toBe(4);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entityType: 'budget_items' }),
    );
  });
});

// =====================================================================
// T26: 編集系メソッドの draft ガード (BUDGET_NOT_EDITABLE)
// 承認済 / 申請中 / 旧版 (superseded) の予算に対する明細編集が拒否されることを保証
// =====================================================================
describe('BudgetItemsService draft ガード', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const status of ['pending_approval', 'approved', 'superseded'] as const) {
    it(`create: status=${status} なら 422 BUDGET_NOT_EDITABLE`, async () => {
      const { service, prisma } = build();
      vi.mocked(prisma.budget.findFirst).mockResolvedValueOnce({
        id: budgetId,
        status,
      } as never);
      await expect(
        service.create(projectId, budgetId, { kind: 'section', name: 'X' }, actorId, ctx),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it(`update: status=${status} なら 422`, async () => {
      const { service, prisma } = build();
      vi.mocked(prisma.budget.findFirst).mockResolvedValueOnce({
        id: budgetId,
        status,
      } as never);
      await expect(
        service.update(
          projectId,
          budgetId,
          itemId,
          { lockVersion: 0, quantity: '1' },
          actorId,
          ctx,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it(`softDelete: status=${status} なら 422`, async () => {
      const { service, prisma } = build();
      vi.mocked(prisma.budget.findFirst).mockResolvedValueOnce({
        id: budgetId,
        status,
      } as never);
      await expect(
        service.softDelete(projectId, budgetId, itemId, 0, actorId, ctx),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  }
});
