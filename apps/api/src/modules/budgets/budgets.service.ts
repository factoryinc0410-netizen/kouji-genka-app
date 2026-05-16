import type {
  Budget as BudgetDto,
  BudgetStatus,
  CreateBudgetRequest,
  ListBudgetsResponse,
  RejectBudgetRequest,
  UpdateBudgetRequest,
} from '@kgk/schemas';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Budget as PrismaBudget } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 指定 project の Budget 一覧 (新しい version 順) */
  async list(projectId: string): Promise<ListBudgetsResponse> {
    const items = await this.prisma.budget.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    return { items: items.map(toPublic), total: items.length };
  }

  async getById(projectId: string, budgetId: string): Promise<BudgetDto> {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
    });
    if (!budget) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }
    return toPublic(budget);
  }

  /**
   * Budget の新規作成。
   * - version 未指定なら同 project 内の max(version)+1
   * - status 既定値は 'draft'
   * - totalAmount は明細投入で動的に更新されるため、ここでは 0 で初期化
   */
  async create(
    projectId: string,
    input: CreateBudgetRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    const version =
      input.version ??
      (await this.prisma.budget
        .aggregate({ _max: { version: true }, where: { projectId } })
        .then((r) => (r._max.version ?? 0) + 1));

    try {
      const created = await this.prisma.budget.create({
        data: {
          projectId,
          version,
          status: input.status ?? 'draft',
          title: input.title ?? null,
          notes: input.notes ?? null,
        },
      });
      await this.audit.log({
        action: 'create',
        userId: actorId,
        entityType: 'budgets',
        entityId: created.id,
        after: snapshot(created),
        ...ctx,
      });
      return toPublic(created);
    } catch (e: unknown) {
      throw mapPrismaError(e);
    }
  }

  /**
   * Budget ヘッダの更新 (title / notes のみ)。
   *
   * - **楽観ロック**: input.lockVersion が現状と一致しなければ 409 BUDGET_VERSION_MISMATCH
   * - **編集ガード**: status === 'draft' のみ許可 (それ以外は 422 BUDGET_NOT_EDITABLE)
   * - **status 変更は本メソッドでは扱わない** → submit/approve/reject/revise の専用 API
   * - 成功時は lockVersion を +1 する。
   */
  async update(
    projectId: string,
    budgetId: string,
    input: UpdateBudgetRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    const before = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }

    if (before.lockVersion !== input.lockVersion) {
      throw versionMismatch(before.lockVersion);
    }

    if (before.status !== 'draft') {
      throw new UnprocessableEntityException({
        code: 'BUDGET_NOT_EDITABLE',
        message: 'draft 以外の予算はタイトル・備考を編集できません',
      });
    }

    const data: Prisma.BudgetUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.notes !== undefined) data.notes = input.notes;
    data.lockVersion = before.lockVersion + 1;

    const updated = await this.prisma.budget.update({ where: { id: budgetId }, data });
    await this.audit.log({
      action: 'update',
      userId: actorId,
      entityType: 'budgets',
      entityId: budgetId,
      before: snapshot(before),
      after: snapshot(updated),
      ...ctx,
    });
    return toPublic(updated);
  }

  // -----------------------------------------------------------------
  // Workflow (T26)
  // -----------------------------------------------------------------

  /**
   * 申請: draft → pending_approval
   * - submittedBy / submittedAt を actor で上書き (再申請にも対応)
   * - audit: action='update', after.workflowAction='submit'
   */
  async submit(
    projectId: string,
    budgetId: string,
    lockVersion: number,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    return this.transition(projectId, budgetId, lockVersion, actorId, ctx, {
      kind: 'submit',
      from: 'draft',
      to: 'pending_approval',
      mutate: (data) => {
        data.submitter = { connect: { id: actorId } };
        data.submittedAt = new Date();
      },
    });
  }

  /**
   * 承認: pending_approval → approved
   * - approver / approvedAt を actor で記録
   */
  async approve(
    projectId: string,
    budgetId: string,
    lockVersion: number,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    return this.transition(projectId, budgetId, lockVersion, actorId, ctx, {
      kind: 'approve',
      from: 'pending_approval',
      to: 'approved',
      mutate: (data) => {
        data.approver = { connect: { id: actorId } };
        data.approvedAt = new Date();
      },
    });
  }

  /**
   * 差戻し: pending_approval → draft
   * - submittedBy / submittedAt をクリア (再申請で再付与)
   * - 差戻しコメントは audit log の after.reason に格納 (DB スキーマ不変)
   */
  async reject(
    projectId: string,
    budgetId: string,
    input: RejectBudgetRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    return this.transition(projectId, budgetId, input.lockVersion, actorId, ctx, {
      kind: 'reject',
      from: 'pending_approval',
      to: 'draft',
      mutate: (data) => {
        // 再申請に向けて申請メタをクリア
        data.submitter = { disconnect: true };
        data.submittedAt = null;
      },
      reason: input.comment,
    });
  }

  /**
   * 改定: approved → superseded + 新 draft (version+1) を作成。
   *
   * トランザクション内で以下を実行:
   *   1) 現 budget を superseded に遷移 (lockVersion +1)
   *   2) max(version)+1 で新 draft を作成 (title/notes/totalAmount をコピー、
   *      submitter/approver は null クリア、lockVersion=0)
   *   3) 配下 items を level 昇順で 1 件ずつ複製、旧→新 id マップで parentId を解決
   *   4) audit: 現 budget に update、新 budget に create (after.workflowAction='revise',
   *      after.sourceBudgetId=旧 id)
   *
   * 戻り値は **新 draft** budget。フロントはこの id に切替表示する。
   */
  async revise(
    projectId: string,
    budgetId: string,
    lockVersion: number,
    actorId: string,
    ctx: AuditContext,
  ): Promise<BudgetDto> {
    const { newBudget, oldSnapshot, newSnapshot } = await this.prisma.$transaction(async (tx) => {
      const before = await tx.budget.findFirst({
        where: { id: budgetId, projectId, deletedAt: null },
      });
      if (!before) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
      }
      if (before.lockVersion !== lockVersion) {
        throw versionMismatch(before.lockVersion);
      }
      if (before.status !== 'approved') {
        throw invalidTransition(before.status, 'superseded', 'revise');
      }

      // 1) 現 budget を superseded
      const oldUpdated = await tx.budget.update({
        where: { id: budgetId },
        data: { status: 'superseded', lockVersion: before.lockVersion + 1 },
      });

      // 2) 新 draft を作成 (version は max+1 を取り直す: superseded 後に他の v が増えていないこと確認は @@unique で守られる)
      const versionAgg = await tx.budget.aggregate({
        _max: { version: true },
        where: { projectId },
      });
      const nextVersion = (versionAgg._max.version ?? 0) + 1;

      const created = await tx.budget.create({
        data: {
          projectId,
          version: nextVersion,
          status: 'draft',
          title: before.title,
          notes: before.notes,
          totalAmount: before.totalAmount, // 明細コピー後と整合 (再計算は不要)
        },
      });

      // 3) 配下 items を level 昇順で複製
      const sourceItems = await tx.budgetItem.findMany({
        where: { budgetId: before.id, deletedAt: null },
        orderBy: [{ level: 'asc' }, { displayOrder: 'asc' }],
      });
      const idMap = new Map<string, string>();
      for (const item of sourceItems) {
        const newParentId = item.parentId ? (idMap.get(item.parentId) ?? null) : null;
        if (item.parentId && newParentId === null) {
          // 設計違反: level 昇順なら親は必ず先に挿入済みのはず
          throw new Error(
            `revise: parent ${item.parentId} not yet mapped (item=${item.id}, level=${item.level})`,
          );
        }
        const newItem = await tx.budgetItem.create({
          data: {
            budgetId: created.id,
            parentId: newParentId,
            level: item.level,
            displayOrder: item.displayOrder,
            kind: item.kind,
            code: item.code,
            name: item.name,
            spec: item.spec,
            unit: item.unit,
            costElement: item.costElement,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            notes: item.notes,
            lockVersion: 0,
          },
        });
        idMap.set(item.id, newItem.id);
      }

      return {
        newBudget: created,
        oldSnapshot: { before: snapshot(before), after: snapshot(oldUpdated) },
        newSnapshot: snapshot(created),
      };
    });

    // 4) audit
    await this.audit.log({
      action: 'update',
      userId: actorId,
      entityType: 'budgets',
      entityId: budgetId,
      before: oldSnapshot.before,
      after: { ...oldSnapshot.after, workflowAction: 'revise' },
      ...ctx,
    });
    await this.audit.log({
      action: 'create',
      userId: actorId,
      entityType: 'budgets',
      entityId: newBudget.id,
      after: { ...newSnapshot, workflowAction: 'revise', sourceBudgetId: budgetId },
      ...ctx,
    });

    return toPublic(newBudget);
  }

  // -----------------------------------------------------------------
  // Workflow internal: 状態遷移を 1 関数に集約
  // -----------------------------------------------------------------
  private async transition(
    projectId: string,
    budgetId: string,
    lockVersion: number,
    actorId: string,
    ctx: AuditContext,
    spec: {
      kind: 'submit' | 'approve' | 'reject';
      from: BudgetStatus;
      to: BudgetStatus;
      mutate?: (data: Prisma.BudgetUpdateInput) => void;
      reason?: string;
    },
  ): Promise<BudgetDto> {
    const before = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }
    if (before.lockVersion !== lockVersion) {
      throw versionMismatch(before.lockVersion);
    }
    if (before.status !== spec.from) {
      throw invalidTransition(before.status, spec.to, spec.kind);
    }

    const data: Prisma.BudgetUpdateInput = {
      status: spec.to,
      lockVersion: before.lockVersion + 1,
    };
    spec.mutate?.(data);

    const updated = await this.prisma.budget.update({ where: { id: budgetId }, data });
    const after: Record<string, unknown> = {
      ...snapshot(updated),
      workflowAction: spec.kind,
    };
    if (spec.reason) after.reason = spec.reason;

    await this.audit.log({
      action: 'update',
      userId: actorId,
      entityType: 'budgets',
      entityId: budgetId,
      before: snapshot(before),
      after,
      ...ctx,
    });
    return toPublic(updated);
  }

  /** 論理削除 (admin 専用、controller で @Roles 制御) */
  async softDelete(
    projectId: string,
    budgetId: string,
    actorId: string,
    ctx: AuditContext,
  ): Promise<void> {
    const before = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }
    await this.prisma.budget.update({
      where: { id: budgetId },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'delete',
      userId: actorId,
      entityType: 'budgets',
      entityId: budgetId,
      before: snapshot(before),
      ...ctx,
    });
  }
}

export function toPublic(b: PrismaBudget): BudgetDto {
  return {
    id: b.id,
    projectId: b.projectId,
    version: b.version,
    status: b.status as BudgetStatus,
    title: b.title,
    totalAmount: b.totalAmount.toString(),
    submittedById: b.submittedById,
    submittedAt: b.submittedAt ? b.submittedAt.toISOString() : null,
    approvedById: b.approvedById,
    approvedAt: b.approvedAt ? b.approvedAt.toISOString() : null,
    notes: b.notes,
    lockVersion: b.lockVersion,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function snapshot(b: PrismaBudget) {
  return {
    projectId: b.projectId,
    version: b.version,
    status: b.status,
    title: b.title,
    totalAmount: b.totalAmount.toString(),
    submittedById: b.submittedById,
    approvedById: b.approvedById,
    notes: b.notes,
    lockVersion: b.lockVersion,
  };
}

function versionMismatch(serverLockVersion: number): ConflictException {
  return new ConflictException({
    code: 'BUDGET_VERSION_MISMATCH',
    message: '他のユーザによって更新されています。再読込してから再度お試しください',
    serverLockVersion,
  });
}

function invalidTransition(from: string, to: string, action: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'INVALID_STATUS_TRANSITION',
    message: `現在のステータス (${from}) では ${action} できません`,
    from,
    to,
  });
}

function mapPrismaError(e: unknown): unknown {
  if (typeof e !== 'object' || e === null || !('code' in e)) return e;
  const code = (e as { code: string }).code;
  if (code === 'P2002') {
    return new ConflictException({
      code: 'BUDGET_VERSION_TAKEN',
      message: '同じバージョンの予算が既に存在します',
    });
  }
  if (code === 'P2003') {
    return new UnprocessableEntityException({
      code: 'RELATED_ENTITY_NOT_FOUND',
      message: '指定された工事またはユーザが存在しません',
    });
  }
  return e;
}
