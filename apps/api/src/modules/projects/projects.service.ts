import {
  type ConstructionType,
  type CreateProjectRequest,
  classifyProjectTransition,
  type ListProjectsQuery,
  type ListProjectsResponse,
  type Project as ProjectDto,
  type ProjectStatus,
  type ProjectType,
  type UpdateProjectRequest,
} from '@kgk/schemas';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Project as PrismaProject } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';
import { ProjectAccessService } from '../auth/project-access.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ProjectAccessService,
  ) {}

  /**
   * 認可済みの一覧取得。
   * ABAC の whereForView と検索条件を AND 結合し、admin/accounting は全件、
   * planner/field/viewer は manager 本人 or UPP の OR で絞り込む。
   */
  async list(actorId: string, query: ListProjectsQuery): Promise<ListProjectsResponse> {
    const accessWhere = await this.access.whereForView(actorId);

    const filters: Prisma.ProjectWhereInput[] = [accessWhere];
    if (query.search) {
      filters.push({
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) filters.push({ status: query.status });
    if (query.projectType) filters.push({ projectType: query.projectType });
    if (query.constructionType) filters.push({ constructionType: query.constructionType });
    if (query.customerId) filters.push({ customerId: query.customerId });
    if (query.managerUserId) filters.push({ managerUserId: query.managerUserId });

    const where: Prisma.ProjectWhereInput =
      filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const [total, items] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: items.map(toPublic),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * 単票取得。Guard 側で ABAC 済みだが、削除済の場合はここで 404 を返す。
   */
  async getById(id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '工事が見つかりません' });
    }
    return toPublic(project);
  }

  /**
   * 作成。
   * - code 重複 → 409
   * - customerId 不存在 (FK 違反 P2003) → 422
   * - status が初期値以外で指定された場合 (任意) → project_status_history に
   *   from=null, to=指定値 で 1 件記録
   */
  async create(
    input: CreateProjectRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ProjectDto> {
    const data: Prisma.ProjectCreateInput = {
      code: input.code,
      name: input.name,
      customer: { connect: { id: input.customerId } },
      location: input.location ?? null,
      startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
      actualEndDate: input.actualEndDate ? new Date(`${input.actualEndDate}T00:00:00.000Z`) : null,
      contractAmount: input.contractAmount ?? '0',
      status: input.status ?? 'bidding',
      projectType: input.projectType ?? 'private',
      constructionType: input.constructionType ?? 'building',
      ...(input.managerUserId ? { manager: { connect: { id: input.managerUserId } } } : {}),
      notes: input.notes ?? null,
    };

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({ data });
        if (input.status && input.status !== 'bidding') {
          await tx.projectStatusHistory.create({
            data: {
              projectId: project.id,
              fromStatus: null,
              toStatus: input.status,
              changedById: actorId,
              reason: input.statusReason ?? null,
            },
          });
        }
        return project;
      });

      await this.audit.log({
        action: 'create',
        userId: actorId,
        entityType: 'projects',
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
   * 更新。
   *
   * status 変更時の業務ルール (T34):
   * - **forward** (PROJECT_STATUS_FORWARD_TRANSITIONS): 通常運用、admin 不要、reason 任意
   * - **backward** (PROJECT_STATUS_BACKWARD_TRANSITIONS): admin 限定 + statusReason 必須
   *   - 非 admin: 403 PROJECT_BACKWARD_FORBIDDEN
   *   - reason 空: 422 PROJECT_STATUS_REASON_REQUIRED
   * - **2 段飛ばし / 完全に不正な遷移**: 422 INVALID_PROJECT_STATUS_TRANSITION
   *
   * 履歴は projects 更新と project_status_history への記録を同一トランザクションで行い、
   * audit_logs.after には `statusChange = { from, to, reason }` を discriminator として付与。
   */
  async update(
    id: string,
    input: UpdateProjectRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ProjectDto> {
    const before = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '工事が見つかりません' });
    }

    const statusChanging = input.status !== undefined && input.status !== before.status;

    // 遷移ルール検証 (status を変更する場合のみ)
    if (statusChanging && input.status) {
      const kind = classifyProjectTransition(before.status as ProjectStatus, input.status);
      if (kind === 'invalid') {
        throw new UnprocessableEntityException({
          code: 'INVALID_PROJECT_STATUS_TRANSITION',
          message: `${before.status} → ${input.status} の遷移は許可されていません (2 段飛ばし等)`,
        });
      }
      if (kind === 'backward') {
        // admin role 検証 (Service 層で取り直す — controller の @Roles では「変更内容により
        // 必要 role が変わる」ケースをカバーできないため)
        const actor = await this.prisma.user.findFirst({
          where: { id: actorId },
          select: { role: { select: { code: true } } },
        });
        if (actor?.role.code !== 'admin') {
          throw new ForbiddenException({
            code: 'PROJECT_BACKWARD_FORBIDDEN',
            message: '後戻り遷移は admin 権限が必要です',
          });
        }
        const reason = input.statusReason?.trim() ?? '';
        if (reason.length === 0) {
          throw new UnprocessableEntityException({
            code: 'PROJECT_STATUS_REASON_REQUIRED',
            message: '後戻り遷移には理由 (statusReason) が必須です',
          });
        }
      }
    }

    const data: Prisma.ProjectUpdateInput = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.customerId !== undefined) {
      data.customer = { connect: { id: input.customerId } };
    }
    if (input.location !== undefined) data.location = input.location;
    if (input.startDate !== undefined) {
      data.startDate = input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null;
    }
    if (input.endDate !== undefined) {
      data.endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
    }
    if (input.actualEndDate !== undefined) {
      data.actualEndDate = input.actualEndDate
        ? new Date(`${input.actualEndDate}T00:00:00.000Z`)
        : null;
    }
    if (input.contractAmount !== undefined) data.contractAmount = input.contractAmount;
    if (input.status !== undefined) data.status = input.status;
    if (input.projectType !== undefined) data.projectType = input.projectType;
    if (input.constructionType !== undefined) data.constructionType = input.constructionType;
    if (input.managerUserId !== undefined) {
      data.manager =
        input.managerUserId === null
          ? { disconnect: true }
          : { connect: { id: input.managerUserId } };
    }
    if (input.notes !== undefined) data.notes = input.notes;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.update({ where: { id }, data });
        if (statusChanging) {
          await tx.projectStatusHistory.create({
            data: {
              projectId: id,
              fromStatus: before.status,
              toStatus: project.status,
              changedById: actorId,
              reason: input.statusReason ?? null,
            },
          });
        }
        return project;
      });

      // audit_logs に statusChange discriminator を埋め込む (T26 workflowAction 方式)
      const after: Record<string, unknown> = snapshot(updated);
      if (statusChanging) {
        after.statusChange = {
          from: before.status,
          to: updated.status,
          reason: input.statusReason ?? null,
        };
      }

      await this.audit.log({
        action: 'update',
        userId: actorId,
        entityType: 'projects',
        entityId: id,
        before: snapshot(before),
        after,
        ...ctx,
      });
      return toPublic(updated);
    } catch (e: unknown) {
      throw mapPrismaError(e);
    }
  }

  /**
   * 論理削除。admin 専用 (controller で @Roles('admin'))。
   */
  async softDelete(id: string, actorId: string, ctx: AuditContext): Promise<void> {
    const before = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '工事が見つかりません' });
    }
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      action: 'delete',
      userId: actorId,
      entityType: 'projects',
      entityId: id,
      before: snapshot(before),
      ...ctx,
    });
  }
}

function toPublic(p: PrismaProject): ProjectDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    customerId: p.customerId,
    location: p.location,
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    actualEndDate: dateOnly(p.actualEndDate),
    // Decimal → string で精度ロスゼロ
    contractAmount: p.contractAmount.toString(),
    status: p.status as ProjectStatus,
    projectType: p.projectType as ProjectType,
    constructionType: p.constructionType as ConstructionType,
    managerUserId: p.managerUserId,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function snapshot(p: PrismaProject) {
  return {
    code: p.code,
    name: p.name,
    customerId: p.customerId,
    location: p.location,
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    actualEndDate: dateOnly(p.actualEndDate),
    contractAmount: p.contractAmount.toString(),
    status: p.status,
    projectType: p.projectType,
    constructionType: p.constructionType,
    managerUserId: p.managerUserId,
    notes: p.notes,
  };
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function mapPrismaError(e: unknown): unknown {
  if (typeof e !== 'object' || e === null || !('code' in e)) {
    return e;
  }
  const code = (e as { code: string }).code;
  if (code === 'P2002') {
    return new ConflictException({
      code: 'PROJECT_CODE_TAKEN',
      message: '同じ工事番号のレコードが既に存在します',
    });
  }
  if (code === 'P2003') {
    // FK 違反 (customerId / managerUserId が存在しない等)
    return new UnprocessableEntityException({
      code: 'RELATED_ENTITY_NOT_FOUND',
      message: '指定された取引先または担当者が存在しません',
    });
  }
  if (code === 'P2025') {
    return new NotFoundException({ code: 'NOT_FOUND', message: '工事が見つかりません' });
  }
  return e;
}
