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
    budget: { findFirst: vi.fn().mockResolvedValue({ id: budgetId }) },
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
