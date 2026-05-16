import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calcLeafAmount, rollUpFromParent, type Tx } from './budget-rollup';

/**
 * ロールアップユーティリティの単体テスト。
 *
 * Prisma クライアントの完全モックは煩雑なので、対象 budget の item 群を Map で保持する
 * 最小限の "in-memory tx" を作り、findUnique / aggregate / update / budget.update のみを
 * 実装する。これにより、実装側 (rollUpFromParent) は本物のロジックがそのまま走る。
 */

interface InMemoryItem {
  id: string;
  budgetId: string;
  parentId: string | null;
  level: number;
  kind: 'section' | 'detail' | 'composite';
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  deletedAt: Date | null;
}

interface InMemoryBudget {
  id: string;
  totalAmount: Prisma.Decimal;
}

function buildTx(items: InMemoryItem[], budget: InMemoryBudget): Tx {
  const map = new Map(items.map((i) => [i.id, i] as const));

  const budgetItem = {
    findUnique: async (args: { where: { id: string }; select?: { parentId?: boolean } }) => {
      const i = map.get(args.where.id);
      if (!i) return null;
      if (args.select?.parentId) return { parentId: i.parentId };
      return { ...i };
    },
    aggregate: async (args: {
      _sum: { amount: true };
      where: { parentId?: string | null; budgetId?: string; level?: number; deletedAt: null };
    }) => {
      const matches = [...map.values()].filter((i) => {
        if (args.where.deletedAt === null && i.deletedAt !== null) return false;
        if (args.where.parentId !== undefined && i.parentId !== args.where.parentId) return false;
        if (args.where.budgetId !== undefined && i.budgetId !== args.where.budgetId) return false;
        if (args.where.level !== undefined && i.level !== args.where.level) return false;
        return true;
      });
      const sum = matches.reduce((acc, x) => acc.plus(x.amount), new Prisma.Decimal(0));
      return { _sum: { amount: sum } };
    },
    update: async (args: { where: { id: string }; data: { amount?: Prisma.Decimal } }) => {
      const i = map.get(args.where.id);
      if (!i) throw new Error('item not found');
      if (args.data.amount !== undefined) i.amount = args.data.amount;
      return { ...i };
    },
  };

  const budgetTable = {
    update: async (args: { where: { id: string }; data: { totalAmount?: Prisma.Decimal } }) => {
      if (args.where.id !== budget.id) throw new Error('budget mismatch');
      if (args.data.totalAmount !== undefined) budget.totalAmount = args.data.totalAmount;
      return { ...budget };
    },
  };

  return { budgetItem, budget: budgetTable } as unknown as Tx;
}

/**
 * シード相当のツリー:
 *   §1 section            (id=s1)
 *     1-1 composite        (id=c11)
 *       1-1-1 detail        (id=d111)  120.5 m3 × 1,200 円 = 144,600
 *       1-1-2 detail        (id=d112)    2.5 人工 × 25,000 円 =  62,500
 *     1-2 detail           (id=d12)   8,500 kg × 180 円 = 1,530,000
 *   §2 detail              (id=d2)    1 式 × 500,000 円 = 500,000
 */
function buildSeedTree() {
  const budget: InMemoryBudget = { id: 'b1', totalAmount: new Prisma.Decimal(0) };
  const items: InMemoryItem[] = [
    {
      id: 's1',
      budgetId: 'b1',
      parentId: null,
      level: 0,
      kind: 'section',
      quantity: new Prisma.Decimal(0),
      unitPrice: new Prisma.Decimal(0),
      amount: new Prisma.Decimal(0),
      deletedAt: null,
    },
    {
      id: 'c11',
      budgetId: 'b1',
      parentId: 's1',
      level: 1,
      kind: 'composite',
      quantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal(0),
      amount: new Prisma.Decimal(0),
      deletedAt: null,
    },
    {
      id: 'd111',
      budgetId: 'b1',
      parentId: 'c11',
      level: 2,
      kind: 'detail',
      quantity: new Prisma.Decimal('120.5'),
      unitPrice: new Prisma.Decimal('1200'),
      amount: new Prisma.Decimal('144600'),
      deletedAt: null,
    },
    {
      id: 'd112',
      budgetId: 'b1',
      parentId: 'c11',
      level: 2,
      kind: 'detail',
      quantity: new Prisma.Decimal('2.5'),
      unitPrice: new Prisma.Decimal('25000'),
      amount: new Prisma.Decimal('62500'),
      deletedAt: null,
    },
    {
      id: 'd12',
      budgetId: 'b1',
      parentId: 's1',
      level: 1,
      kind: 'detail',
      quantity: new Prisma.Decimal('8500'),
      unitPrice: new Prisma.Decimal('180'),
      amount: new Prisma.Decimal('1530000'),
      deletedAt: null,
    },
    {
      id: 'd2',
      budgetId: 'b1',
      parentId: null,
      level: 0,
      kind: 'detail',
      quantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal('500000'),
      amount: new Prisma.Decimal('500000'),
      deletedAt: null,
    },
  ];
  return { budget, items, byId: (id: string) => items.find((x) => x.id === id) };
}

// ---------------------------------------------------------------------
describe('calcLeafAmount', () => {
  it('quantity * unitPrice を numeric(15,0) (整数) に丸める', () => {
    // 120.5 * 1200 = 144,600.0  → "144600"
    expect(calcLeafAmount('120.5', '1200').toString()).toBe('144600');
    // 0.3 * 999 = 299.7 → ROUND_HALF_UP で 300
    expect(calcLeafAmount('0.3', '999').toString()).toBe('300');
    // 0.2 * 5 = 1.0 → "1"
    expect(calcLeafAmount('0.2', '5').toString()).toBe('1');
    // 0.0001 * 10000 = 1.0
    expect(calcLeafAmount('0.0001', '10000').toString()).toBe('1');
  });
});

// ---------------------------------------------------------------------
describe('rollUpFromParent: 葉 → 親方向にボトムアップ集計し totalAmount まで更新', () => {
  it('detail の amount を変えると composite → section → totalAmount まで連鎖更新', async () => {
    const seed = buildSeedTree();
    // まず初期状態を整える: composite / section / totalAmount をいったん rollUp して同期
    const tx0 = buildTx(seed.items, seed.budget);
    await rollUpFromParent(tx0, 'b1', 'c11'); // 初期同期
    // この時点で:
    //   composite c11 = 144,600 + 62,500 = 207,100
    //   section s1    = c11 + d12 = 207,100 + 1,530,000 = 1,737,100
    //   total         = s1 + d2  = 1,737,100 + 500,000 = 2,237,100
    expect(seed.byId('c11')?.amount.toString()).toBe('207100');
    expect(seed.byId('s1')?.amount.toString()).toBe('1737100');
    expect(seed.budget.totalAmount.toString()).toBe('2237100');

    // --- ここで d111 (detail) の amount を変更 (例: 数量を 120.5 → 200 に増やしたケース)
    // 新しい葉 amount = 200 * 1200 = 240,000
    const d111 = seed.byId('d111');
    if (!d111) throw new Error('seed broken');
    d111.quantity = new Prisma.Decimal('200');
    d111.amount = calcLeafAmount(d111.quantity, d111.unitPrice); // 240,000
    expect(d111.amount.toString()).toBe('240000');

    // rollUp を起点 = d111.parentId (= c11) で呼ぶ
    const tx = buildTx(seed.items, seed.budget);
    await rollUpFromParent(tx, 'b1', 'c11');

    // 期待:
    //   composite c11 = 240,000 + 62,500 = 302,500
    //   section s1    = 302,500 + 1,530,000 = 1,832,500
    //   total         = 1,832,500 + 500,000 = 2,332,500
    expect(seed.byId('c11')?.amount.toString()).toBe('302500');
    expect(seed.byId('s1')?.amount.toString()).toBe('1832500');
    expect(seed.budget.totalAmount.toString()).toBe('2332500');
  });

  it('detail を論理削除すると親集計から除外され totalAmount が下がる', async () => {
    const seed = buildSeedTree();
    // 初期同期
    await rollUpFromParent(buildTx(seed.items, seed.budget), 'b1', 'c11');
    expect(seed.budget.totalAmount.toString()).toBe('2237100');

    // d2 (level=0 / 500,000 円) を論理削除
    const d2 = seed.byId('d2');
    if (!d2) throw new Error('seed broken');
    d2.deletedAt = new Date();

    // d2 は parentId=null (root) なので、rollUp 起点も null → totalAmount のみ再計算
    await rollUpFromParent(buildTx(seed.items, seed.budget), 'b1', null);

    // 期待: 削除済 d2 は除外、totalAmount = s1 = 1,737,100
    expect(seed.budget.totalAmount.toString()).toBe('1737100');
  });

  it('section 直下の detail を更新するとその section の amount と totalAmount が更新される', async () => {
    const seed = buildSeedTree();
    await rollUpFromParent(buildTx(seed.items, seed.budget), 'b1', 'c11');

    // d12 (鉄筋 8,500 kg × 180 = 1,530,000) → 10,000 kg × 180 = 1,800,000
    const d12 = seed.byId('d12');
    if (!d12) throw new Error('seed broken');
    d12.quantity = new Prisma.Decimal('10000');
    d12.amount = calcLeafAmount(d12.quantity, d12.unitPrice);

    // d12 の parent = s1 を起点に rollUp
    await rollUpFromParent(buildTx(seed.items, seed.budget), 'b1', 's1');

    // composite c11 は変わらず 207,100
    expect(seed.byId('c11')?.amount.toString()).toBe('207100');
    // section s1 = 207,100 + 1,800,000 = 2,007,100
    expect(seed.byId('s1')?.amount.toString()).toBe('2007100');
    // total = 2,007,100 + 500,000 = 2,507,100
    expect(seed.budget.totalAmount.toString()).toBe('2507100');
  });
});
