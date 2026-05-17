import type { BudgetHistoryEvent, BudgetHistoryEventType } from '@kgk/schemas';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditLog, User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * T33: 予算のワークフロー履歴タイムライン。
 *
 * 既存の audit_logs を読み出し、業務的な節目 (create / submit / approve / reject /
 * revise / revise_from / export) のみを正規化して返す。
 * - DB スキーマは変更せず、`after.workflowAction` の discriminator を読む。
 * - 取得範囲: 当該 budgetId 直接イベント + その予算を起点に派生した新版 (sourceBudgetId 逆引き)。
 * - 純粋な PATCH 編集 (workflowAction なしの update) は履歴対象外として除外。
 */

type AuditLogWithUser = AuditLog & { user: Pick<User, 'id' | 'name'> | null };

@Injectable()
export class BudgetHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listHistory(projectId: string, budgetId: string): Promise<BudgetHistoryEvent[]> {
    // budget の所属検証 (ABAC は Controller 側、ここは整合性チェック)
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!budget) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }

    // 1) 直接イベント: entityId=budgetId
    const direct = await this.prisma.auditLog.findMany({
      where: { entityType: 'budgets', entityId: budgetId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { occurredAt: 'asc' },
    });

    // 2) revise_from イベント (この予算を起点に作られた新 draft):
    //    action=create AND after.sourceBudgetId=budgetId
    //    Prisma の JSON フィルタは path で string 比較可能。
    const reviseFrom = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'budgets',
        action: 'create',
        after: { path: ['sourceBudgetId'], equals: budgetId },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { occurredAt: 'asc' },
    });

    const events: BudgetHistoryEvent[] = [];
    for (const log of direct) {
      const e = normalizeDirect(log);
      if (e) events.push(e);
    }
    for (const log of reviseFrom) {
      // 同 id が direct にも入る (新 draft 側で entityId が一致するため) ので、
      // direct ループで 'create' (workflowAction=revise) として既に拾われている場合は重複させない。
      // revise_from は「旧版 → 新版を見る」ための逆引き専用。budgetId と entityId が異なる時のみ採用。
      if (log.entityId === budgetId) continue;
      events.push(normalizeReviseFrom(log));
    }

    // 時系列に統合ソート (occurredAt は ISO 文字列で同じ並びになる)
    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return events;
  }
}

/**
 * 直接イベント (entityId=budgetId) の正規化。
 * 業務的節目に該当しないログ (純粋な PATCH 等) は null を返して捨てる。
 */
function normalizeDirect(log: AuditLogWithUser): BudgetHistoryEvent | null {
  const after = (log.after ?? null) as Record<string, unknown> | null;
  const workflowAction = typeof after?.workflowAction === 'string' ? after.workflowAction : null;

  // export: action=export
  if (log.action === 'export') {
    return makeEvent(log, 'export', { reason: null, sourceBudgetId: null, newBudgetId: null });
  }

  // create: action=create
  // - workflowAction=revise の場合は「この予算が改定で生まれた新版」(= revise_from を当該 budgetId に展開)
  // - それ以外 (workflowAction なし) は通常の create
  if (log.action === 'create') {
    if (workflowAction === 'revise') {
      const sourceBudgetId =
        typeof after?.sourceBudgetId === 'string' ? after.sourceBudgetId : null;
      return makeEvent(log, 'revise_from', {
        reason: null,
        sourceBudgetId,
        newBudgetId: null,
      });
    }
    return makeEvent(log, 'create', { reason: null, sourceBudgetId: null, newBudgetId: null });
  }

  // update: workflowAction 必須。それ以外 (純粋な PATCH) は履歴対象外
  if (log.action === 'update' && workflowAction !== null) {
    if (workflowAction === 'submit') {
      return makeEvent(log, 'submit', { reason: null, sourceBudgetId: null, newBudgetId: null });
    }
    if (workflowAction === 'approve') {
      return makeEvent(log, 'approve', { reason: null, sourceBudgetId: null, newBudgetId: null });
    }
    if (workflowAction === 'reject') {
      const reason = typeof after?.reason === 'string' ? after.reason : null;
      return makeEvent(log, 'reject', { reason, sourceBudgetId: null, newBudgetId: null });
    }
    if (workflowAction === 'revise') {
      // 旧版側 (superseded された) の update。新 draft id は直接記録されないので null。
      // 将来 budget-version-chain で補完予定。
      return makeEvent(log, 'revise', {
        reason: null,
        sourceBudgetId: null,
        newBudgetId: null,
      });
    }
  }

  return null;
}

/**
 * 逆引きイベント: この予算を起点に新版が作られたという事実を、
 * 旧版 (budgetId) のタイムラインに「→ 新版 X が作られた」として表示するための変換。
 */
function normalizeReviseFrom(log: AuditLogWithUser): BudgetHistoryEvent {
  const after = (log.after ?? null) as Record<string, unknown> | null;
  // entityId が新 draft の id
  const newBudgetId = log.entityId;
  return makeEvent(log, 'revise', {
    reason: null,
    sourceBudgetId: null,
    newBudgetId,
    // meta はそのまま (version 等を渡す)
    metaOverride: after,
  });
}

/** 共通フィールド組み立て */
function makeEvent(
  log: AuditLogWithUser,
  eventType: BudgetHistoryEventType,
  extras: {
    reason: string | null;
    sourceBudgetId: string | null;
    newBudgetId: string | null;
    metaOverride?: Record<string, unknown> | null;
  },
): BudgetHistoryEvent {
  const after = (log.after ?? null) as Record<string, unknown> | null;
  return {
    id: log.id.toString(),
    occurredAt: log.occurredAt.toISOString(),
    eventType,
    actor: {
      id: log.user?.id ?? null,
      name: log.user?.name ?? null,
    },
    reason: extras.reason,
    sourceBudgetId: extras.sourceBudgetId,
    newBudgetId: extras.newBudgetId,
    meta: pickMeta(extras.metaOverride ?? after),
  };
}

/** meta に渡す補助情報。秘匿情報や巨大ペイロードは含めない */
function pickMeta(after: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!after) return null;
  const meta: Record<string, unknown> = {};
  for (const key of ['version', 'status', 'format', 'totalAmount', 'itemCount'] as const) {
    if (after[key] !== undefined) meta[key] = after[key];
  }
  return Object.keys(meta).length > 0 ? meta : null;
}
