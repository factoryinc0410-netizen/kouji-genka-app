import type {
  BudgetItem as BudgetItemDto,
  BudgetItemKind,
  BudgetItemTreeResponse,
  CostElement,
  CreateBudgetItemRequest,
  UpdateBudgetItemRequest,
} from '@kgk/schemas';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type BudgetItem as PrismaBudgetItem } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';
import { calcLeafAmount, rollUpFromParent, type Tx } from './budget-rollup';

@Injectable()
export class BudgetItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -----------------------------------------------------------------
  // 取得
  // -----------------------------------------------------------------

  /**
   * 指定 Budget の明細をフラット配列で返す。
   * UI 側で parent_id を辿ってツリー化する想定 (DB 走査は level → display_order 順)。
   */
  async listTree(projectId: string, budgetId: string): Promise<BudgetItemTreeResponse> {
    await this.ensureBudget(projectId, budgetId);
    const items = await this.prisma.budgetItem.findMany({
      where: { budgetId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { displayOrder: 'asc' }],
    });
    return { items: items.map(toPublic), total: items.length };
  }

  async getById(projectId: string, budgetId: string, itemId: string): Promise<BudgetItemDto> {
    await this.ensureBudget(projectId, budgetId);
    const item = await this.prisma.budgetItem.findFirst({
      where: { id: itemId, budgetId, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '明細が見つかりません' });
    }
    return toPublic(item);
  }

  // -----------------------------------------------------------------
  // 作成
  // -----------------------------------------------------------------

  /**
   * 明細を新規作成し、親方向に amount を再計算 → Budget.totalAmount を更新。
   *
   * - level は親の level + 1。parent が null なら 0。
   * - displayOrder 未指定なら兄弟内 max(displayOrder)+1000、空なら 1000。
   * - kind=detail のみ amount = quantity * unitPrice。section/composite は 0 で初期化し
   *   rollUp で子集計から確定する。
   * - 親 (composite/section) に新規子が追加されると親の amount が変わるため必ず rollUp。
   */
  async create(
    projectId: string,
    budgetId: string,
    input: CreateBudgetItemRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetItemDto> {
    await this.ensureBudget(projectId, budgetId);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        let level = 0;
        let parentId: string | null = null;
        if (input.parentId) {
          const parent = await tx.budgetItem.findFirst({
            where: { id: input.parentId, budgetId, deletedAt: null },
            select: { id: true, level: true, kind: true },
          });
          if (!parent) {
            throw new UnprocessableEntityException({
              code: 'RELATED_ENTITY_NOT_FOUND',
              message: '親明細が見つかりません',
            });
          }
          if (parent.kind === 'detail') {
            // 葉に子をぶら下げようとするのは設計違反 → 422 で拒否
            throw new UnprocessableEntityException({
              code: 'INVALID_PARENT_KIND',
              message: '葉ノード (detail) の下には子を追加できません',
            });
          }
          parentId = parent.id;
          level = parent.level + 1;
        }

        // displayOrder の自動採番 (1000 刻みで挿入余地を残す)
        let displayOrder = input.displayOrder;
        if (displayOrder === undefined) {
          const maxAgg = await tx.budgetItem.aggregate({
            _max: { displayOrder: true },
            where: { budgetId, parentId, deletedAt: null },
          });
          displayOrder = (maxAgg._max.displayOrder ?? 0) + 1000;
        }

        // 葉のみ quantity * unitPrice、節点は 0 で作って rollUp で確定
        const quantity = new Prisma.Decimal(input.quantity ?? '0');
        const unitPrice = new Prisma.Decimal(input.unitPrice ?? '0');
        const amount =
          input.kind === 'detail' ? calcLeafAmount(quantity, unitPrice) : new Prisma.Decimal(0);

        const item = await tx.budgetItem.create({
          data: {
            budgetId,
            parentId,
            level,
            displayOrder,
            kind: input.kind,
            code: input.code ?? null,
            name: input.name,
            spec: input.spec ?? null,
            unit: input.unit ?? null,
            costElement: input.costElement ?? null,
            quantity,
            unitPrice,
            amount,
            notes: input.notes ?? null,
          },
        });

        // 親方向に rollUp。parentId が null (= level 0) でも totalAmount は更新される
        await rollUpFromParent(tx as Tx, budgetId, parentId);
        return item;
      });

      await this.audit.log({
        action: 'create',
        userId: actorId,
        entityType: 'budget_items',
        entityId: created.id,
        after: snapshot(created),
        ...ctx,
      });
      return toPublic(created);
    } catch (e: unknown) {
      throw mapPrismaError(e);
    }
  }

  // -----------------------------------------------------------------
  // 更新
  // -----------------------------------------------------------------

  /**
   * 明細を更新する。楽観ロック必須。
   *
   * 流れ:
   *   1) lockVersion チェック
   *   2) parentId 変更 (tree move) の場合:
   *      - 新親が同じ budget 内、削除されておらず、葉 (detail) でないことを検証
   *      - 自分自身や子孫への移動 (= 循環) を拒否 (422 INVALID_PARENT)
   *      - 自分の level を 新親.level + 1 (root の場合 0) に更新
   *      - 子孫の level を 自分の新 level からの相対差分で連鎖更新
   *   3) quantity/unitPrice が変わった場合、kind=detail なら amount を再計算
   *   4) rollUp:
   *      - 親変更があった場合は 旧親 → 新親 の順で 2 回
   *      - そうでなく金額影響があった場合は 旧親で 1 回
   *   5) audit_logs に before/after
   */
  async update(
    projectId: string,
    budgetId: string,
    itemId: string,
    input: UpdateBudgetItemRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetItemDto> {
    await this.ensureBudget(projectId, budgetId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.budgetItem.findFirst({
        where: { id: itemId, budgetId, deletedAt: null },
      });
      if (!before) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '明細が見つかりません' });
      }

      // 楽観ロック検証
      if (before.lockVersion !== input.lockVersion) {
        throw new ConflictException({
          code: 'BUDGET_ITEM_VERSION_MISMATCH',
          message: '他のユーザによって更新されています。再読込してから再度お試しください',
          serverLockVersion: before.lockVersion,
        });
      }

      const data: Prisma.BudgetItemUpdateInput = {};
      if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
      if (input.code !== undefined) data.code = input.code;
      if (input.name !== undefined) data.name = input.name;
      if (input.spec !== undefined) data.spec = input.spec;
      if (input.unit !== undefined) data.unit = input.unit;
      if (input.costElement !== undefined) data.costElement = input.costElement;
      if (input.notes !== undefined) data.notes = input.notes;

      // ------- 親付け替え (tree move) -------
      const parentChanging =
        input.parentId !== undefined && (input.parentId ?? null) !== before.parentId;
      let newLevel = before.level;
      if (parentChanging) {
        if (input.parentId === null) {
          newLevel = 0;
          data.parent = { disconnect: true };
        } else {
          // 同じ budget 内、削除されておらず、detail (葉) でないこと
          const newParent = await tx.budgetItem.findFirst({
            where: { id: input.parentId, budgetId, deletedAt: null },
            select: { id: true, level: true, kind: true },
          });
          if (!newParent) {
            throw new UnprocessableEntityException({
              code: 'RELATED_ENTITY_NOT_FOUND',
              message: '指定された親明細が見つかりません',
            });
          }
          if (newParent.kind === 'detail') {
            throw new UnprocessableEntityException({
              code: 'INVALID_PARENT_KIND',
              message: '葉ノード (detail) の下には子を追加できません',
            });
          }
          // 自分自身 / 子孫への移動禁止 (循環防止)
          if (newParent.id === before.id || (await isDescendant(tx, before.id, newParent.id))) {
            throw new UnprocessableEntityException({
              code: 'INVALID_PARENT',
              message: '自身または子孫の下には移動できません',
            });
          }
          newLevel = newParent.level + 1;
          data.parent = { connect: { id: newParent.id } };
        }
        data.level = newLevel;
      }

      // 数量・単価が来たら amount 再計算 (葉 detail のみ)
      const nextQty =
        input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : before.quantity;
      const nextPrice =
        input.unitPrice !== undefined ? new Prisma.Decimal(input.unitPrice) : before.unitPrice;
      const qtyChanged = input.quantity !== undefined && !nextQty.equals(before.quantity);
      const priceChanged = input.unitPrice !== undefined && !nextPrice.equals(before.unitPrice);

      if (input.quantity !== undefined) data.quantity = nextQty;
      if (input.unitPrice !== undefined) data.unitPrice = nextPrice;
      if (before.kind === 'detail' && (qtyChanged || priceChanged)) {
        data.amount = calcLeafAmount(nextQty, nextPrice);
      }

      data.lockVersion = before.lockVersion + 1;

      const item = await tx.budgetItem.update({ where: { id: itemId }, data });

      // 子孫の level を相対差分で更新
      if (parentChanging && newLevel !== before.level) {
        const delta = newLevel - before.level;
        await shiftDescendantLevel(tx, item.id, delta);
      }

      // ロールアップ
      const amountChanged = before.kind === 'detail' && (qtyChanged || priceChanged);
      if (parentChanging) {
        // 旧親 (abandoned) と新親 (received) 両方を再集計
        await rollUpFromParent(tx as Tx, budgetId, before.parentId);
        await rollUpFromParent(tx as Tx, budgetId, item.parentId);
      } else if (amountChanged) {
        await rollUpFromParent(tx as Tx, budgetId, before.parentId);
      }

      return { item, before };
    });

    await this.audit.log({
      action: 'update',
      userId: actorId,
      entityType: 'budget_items',
      entityId: itemId,
      before: snapshot(updated.before),
      after: snapshot(updated.item),
      ...ctx,
    });
    return toPublic(updated.item);
  }

  // -----------------------------------------------------------------
  // 削除 (論理削除)
  // -----------------------------------------------------------------

  /**
   * 明細を論理削除し、親方向に amount を再計算。
   * - 子を持つ section/composite の削除は 422 (先に子を消す UX に倒す)
   * - 楽観ロック必須
   */
  async softDelete(
    projectId: string,
    budgetId: string,
    itemId: string,
    lockVersion: number,
    actorId: string,
    ctx: AuditContext,
  ): Promise<void> {
    await this.ensureBudget(projectId, budgetId);

    const before = await this.prisma.$transaction(async (tx) => {
      const item = await tx.budgetItem.findFirst({
        where: { id: itemId, budgetId, deletedAt: null },
      });
      if (!item) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '明細が見つかりません' });
      }
      if (item.lockVersion !== lockVersion) {
        throw new ConflictException({
          code: 'BUDGET_ITEM_VERSION_MISMATCH',
          message: '他のユーザによって更新されています。再読込してから再度お試しください',
          serverLockVersion: item.lockVersion,
        });
      }
      const childCount = await tx.budgetItem.count({
        where: { parentId: itemId, deletedAt: null },
      });
      if (childCount > 0) {
        throw new UnprocessableEntityException({
          code: 'HAS_CHILDREN',
          message: '子明細が残っています。先に配下を削除してください',
        });
      }

      await tx.budgetItem.update({
        where: { id: itemId },
        data: { deletedAt: new Date(), lockVersion: item.lockVersion + 1 },
      });
      await rollUpFromParent(tx as Tx, budgetId, item.parentId);
      return item;
    });

    await this.audit.log({
      action: 'delete',
      userId: actorId,
      entityType: 'budget_items',
      entityId: itemId,
      before: snapshot(before),
      ...ctx,
    });
  }

  // -----------------------------------------------------------------
  // internal
  // -----------------------------------------------------------------

  /** 指定 budget が project に属し、論理削除されていないかを検証 */
  private async ensureBudget(projectId: string, budgetId: string): Promise<void> {
    const exists = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }
  }
}

/**
 * candidate が ancestor の子孫かを BFS で判定する。
 * ツリー移動時の循環防止に使う (= 自分の子孫を新親に指定するのを禁止)。
 * 深さ 50 をガード上限とする。
 */
async function isDescendant(tx: Tx, ancestorId: string, candidateId: string): Promise<boolean> {
  let frontier: string[] = [ancestorId];
  for (let depth = 0; depth < 50 && frontier.length > 0; depth++) {
    const children = await tx.budgetItem.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    const ids = children.map((c) => c.id);
    if (ids.includes(candidateId)) return true;
    frontier = ids;
  }
  return false;
}

/**
 * 指定 item を起点に、配下の **子孫すべての level** を delta だけシフトする。
 * 親付け替えで level が変わった場合に呼ばれる。BFS で 1 階層ずつ updateMany。
 */
async function shiftDescendantLevel(tx: Tx, rootId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  let frontier: string[] = [rootId];
  for (let depth = 0; depth < 50 && frontier.length > 0; depth++) {
    const children = await tx.budgetItem.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: { id: true, level: true },
    });
    if (children.length === 0) break;
    // 同じ delta を一括 update (Prisma の updateMany は SET col=col+? を直接書けないので
    //  小バッチで update を呼ぶ。深さ 50 以内、件数は実運用で数十〜数百を想定)
    for (const c of children) {
      await tx.budgetItem.update({
        where: { id: c.id },
        data: { level: c.level + delta },
      });
    }
    frontier = children.map((c) => c.id);
  }
}

// =====================================================================
// public DTO 変換
// =====================================================================

export function toPublic(p: PrismaBudgetItem): BudgetItemDto {
  return {
    id: p.id,
    budgetId: p.budgetId,
    parentId: p.parentId,
    level: p.level,
    displayOrder: p.displayOrder,
    kind: p.kind as BudgetItemKind,
    code: p.code,
    name: p.name,
    spec: p.spec,
    unit: p.unit,
    costElement: p.costElement as CostElement | null,
    // numeric を string で返却 (精度ロスゼロ方針)
    quantity: p.quantity.toString(),
    unitPrice: p.unitPrice.toString(),
    amount: p.amount.toString(),
    notes: p.notes,
    lockVersion: p.lockVersion,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function snapshot(p: PrismaBudgetItem) {
  return {
    budgetId: p.budgetId,
    parentId: p.parentId,
    level: p.level,
    displayOrder: p.displayOrder,
    kind: p.kind,
    code: p.code,
    name: p.name,
    costElement: p.costElement,
    quantity: p.quantity.toString(),
    unitPrice: p.unitPrice.toString(),
    amount: p.amount.toString(),
    lockVersion: p.lockVersion,
  };
}

function mapPrismaError(e: unknown): unknown {
  if (e instanceof ConflictException) return e;
  if (e instanceof NotFoundException) return e;
  if (e instanceof UnprocessableEntityException) return e;
  if (typeof e !== 'object' || e === null || !('code' in e)) return e;
  const code = (e as { code: string }).code;
  if (code === 'P2003') {
    return new UnprocessableEntityException({
      code: 'RELATED_ENTITY_NOT_FOUND',
      message: '指定された予算または親明細が存在しません',
    });
  }
  if (code === 'P2025') {
    return new NotFoundException({ code: 'NOT_FOUND', message: '明細が見つかりません' });
  }
  return e;
}
