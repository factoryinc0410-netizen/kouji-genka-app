import type {
  Budget as BudgetDto,
  BudgetStatus,
  CreateBudgetRequest,
  ListBudgetsResponse,
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
   * Budget ヘッダの更新。
   *
   * - **楽観ロック**: input.lockVersion が現状と一致しなければ 409 BUDGET_VERSION_MISMATCH
   * - **編集ガード**: title / notes の変更は status === 'draft' のみ許可 (それ以外は 422
   *   BUDGET_NOT_EDITABLE)。一方 status 変更 (T26 ワークフロー用) はガードしない。
   * - status を pending_approval / approved に遷移させる場合は submitter / approver を
   *   actor として記録する。
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

    // 楽観ロック検証
    if (before.lockVersion !== input.lockVersion) {
      throw new ConflictException({
        code: 'BUDGET_VERSION_MISMATCH',
        message: '他のユーザによって更新されています。再読込してから再度お試しください',
        serverLockVersion: before.lockVersion,
      });
    }

    // title / notes の編集は draft 状態のみ許可
    const editsTitleOrNotes = input.title !== undefined || input.notes !== undefined;
    if (editsTitleOrNotes && before.status !== 'draft') {
      throw new UnprocessableEntityException({
        code: 'BUDGET_NOT_EDITABLE',
        message: 'draft 以外の予算はタイトル・備考を編集できません',
      });
    }

    const data: Prisma.BudgetUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.status !== undefined) {
      data.status = input.status;
      // 状態遷移の簡易タイムスタンプ記録 (Prisma リレーション名は submitter / approver)
      if (input.status === 'pending_approval' && !before.submittedAt) {
        data.submitter = { connect: { id: actorId } };
        data.submittedAt = new Date();
      }
      if (input.status === 'approved' && !before.approvedAt) {
        data.approver = { connect: { id: actorId } };
        data.approvedAt = new Date();
      }
    }
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
