import { Prisma } from '@prisma/client';

/**
 * Budget の集計再計算 (ロールアップ) ユーティリティ。
 *
 * すべて Prisma の **TransactionClient** を引数に取り、呼び出し元の $transaction の
 * 内側で同期的に整合した状態に落とすことを前提とする。
 *
 * - 葉ノード (kind=detail, 子を持たない) の amount は quantity * unitPrice
 * - 中間ノード (section / composite) の amount は子の amount 合計
 * - Budget.totalAmount は level=0 の子の amount 合計
 *
 * すべて Prisma.Decimal で計算し、最終的に numeric(15,0) に丸める
 * (CLAUDE.md: 浮動小数点演算は禁止)。
 */

/** Prisma の TransactionClient 型 */
export type Tx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** quantity * unitPrice を numeric(15,0) に丸めて返す */
export function calcLeafAmount(
  quantity: Prisma.Decimal | string,
  unitPrice: Prisma.Decimal | string,
): Prisma.Decimal {
  const q = quantity instanceof Prisma.Decimal ? quantity : new Prisma.Decimal(quantity);
  const u = unitPrice instanceof Prisma.Decimal ? unitPrice : new Prisma.Decimal(unitPrice);
  return q.mul(u).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * 指定 item の amount を「子の amount 合計」で更新する。
 * - 葉のときは何もしない (葉は quantity*unitPrice で別途更新される想定)
 * - deleted_at != null の子は集計から除外
 *
 * 返り値: 更新後の amount (Decimal)
 */
async function recalcNodeAmount(tx: Tx, itemId: string): Promise<Prisma.Decimal> {
  const agg = await tx.budgetItem.aggregate({
    _sum: { amount: true },
    where: { parentId: itemId, deletedAt: null },
  });
  const sum = agg._sum.amount ?? new Prisma.Decimal(0);
  await tx.budgetItem.update({
    where: { id: itemId },
    data: { amount: sum },
  });
  return sum;
}

/**
 * 指定 item の親を辿りながら amount を更新し、最後に Budget.totalAmount を再計算する。
 *
 * @param tx        TransactionClient
 * @param budgetId  対象 Budget の ID
 * @param fromParentId 起点 (= 変更があった item の parentId)。null なら totalAmount のみ再計算。
 */
export async function rollUpFromParent(
  tx: Tx,
  budgetId: string,
  fromParentId: string | null,
): Promise<void> {
  let cursor: string | null = fromParentId;
  // 親方向に辿る。循環は DB 制約上ありえないが、念のためガード (深さ 50 を上限とする)
  for (let i = 0; cursor && i < 50; i++) {
    await recalcNodeAmount(tx, cursor);
    const parent = await tx.budgetItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }

  // Budget.totalAmount は level=0 (= ルート) の amount 合計
  const top = await tx.budgetItem.aggregate({
    _sum: { amount: true },
    where: { budgetId, level: 0, deletedAt: null },
  });
  await tx.budget.update({
    where: { id: budgetId },
    data: { totalAmount: top._sum.amount ?? new Prisma.Decimal(0) },
  });
}
