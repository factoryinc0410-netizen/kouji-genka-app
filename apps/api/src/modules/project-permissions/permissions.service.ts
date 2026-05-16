import type {
  GrantProjectPermissionRequest,
  ListProjectPermissionsResponse,
  ProjectPermission as ProjectPermissionDto,
  UpdateProjectPermissionRequest,
} from '@kgk/schemas';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';

type UppWithUser = Prisma.UserProjectPermissionGetPayload<{
  include: { user: { include: { role: true } } };
}>;

@Injectable()
export class ProjectPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 指定 project の UPP 一覧 (user 情報込み)。
   * project の論理削除済みでも返す (admin が掃除できるように)。
   */
  async list(projectId: string): Promise<ListProjectPermissionsResponse> {
    const items = await this.prisma.userProjectPermission.findMany({
      where: { projectId },
      include: { user: { include: { role: true } } },
      orderBy: [{ user: { name: 'asc' } }, { createdAt: 'asc' }],
    });
    return { items: items.map(toPublic), total: items.length };
  }

  /**
   * UPP を新規付与。
   * - 重複 (P2002) → 409 PROJECT_PERMISSION_EXISTS
   * - userId / projectId 不在 (P2003) → 422 RELATED_ENTITY_NOT_FOUND
   * - audit_logs に permission_change として after を記録
   */
  async grant(
    projectId: string,
    input: GrantProjectPermissionRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ProjectPermissionDto> {
    try {
      const created = await this.prisma.userProjectPermission.create({
        data: {
          projectId,
          userId: input.userId,
          canView: input.canView ?? true,
          canEdit: input.canEdit ?? false,
        },
        include: { user: { include: { role: true } } },
      });
      await this.audit.log({
        action: 'permission_change',
        userId: actorId,
        entityType: 'user_project_permissions',
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
   * UPP を更新 (canView / canEdit のいずれか一方でも可)。
   */
  async update(
    projectId: string,
    userId: string,
    input: UpdateProjectPermissionRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ProjectPermissionDto> {
    const before = await this.prisma.userProjectPermission.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { user: { include: { role: true } } },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '指定された権限レコードが見つかりません',
      });
    }

    const data: Prisma.UserProjectPermissionUpdateInput = {};
    if (input.canView !== undefined) data.canView = input.canView;
    if (input.canEdit !== undefined) data.canEdit = input.canEdit;

    const updated = await this.prisma.userProjectPermission.update({
      where: { userId_projectId: { userId, projectId } },
      data,
      include: { user: { include: { role: true } } },
    });

    await this.audit.log({
      action: 'permission_change',
      userId: actorId,
      entityType: 'user_project_permissions',
      entityId: updated.id,
      before: snapshot(before),
      after: snapshot(updated),
      ...ctx,
    });
    return toPublic(updated);
  }

  /**
   * UPP を取り消し。
   */
  async revoke(
    projectId: string,
    userId: string,
    actorId: string,
    ctx: AuditContext,
  ): Promise<void> {
    const before = await this.prisma.userProjectPermission.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { user: { include: { role: true } } },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '指定された権限レコードが見つかりません',
      });
    }
    await this.prisma.userProjectPermission.delete({
      where: { userId_projectId: { userId, projectId } },
    });
    await this.audit.log({
      action: 'permission_change',
      userId: actorId,
      entityType: 'user_project_permissions',
      entityId: before.id,
      before: snapshot(before),
      ...ctx,
    });
  }
}

function toPublic(p: UppWithUser): ProjectPermissionDto {
  return {
    id: p.id,
    userId: p.userId,
    projectId: p.projectId,
    canView: p.canView,
    canEdit: p.canEdit,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    user: {
      id: p.user.id,
      email: p.user.email,
      name: p.user.name,
      isActive: p.user.isActive,
      role: { code: p.user.role.code, name: p.user.role.name },
    },
  };
}

function snapshot(p: UppWithUser) {
  return {
    userId: p.userId,
    projectId: p.projectId,
    canView: p.canView,
    canEdit: p.canEdit,
  };
}

function mapPrismaError(e: unknown): unknown {
  if (typeof e !== 'object' || e === null || !('code' in e)) return e;
  const code = (e as { code: string }).code;
  if (code === 'P2002') {
    return new ConflictException({
      code: 'PROJECT_PERMISSION_EXISTS',
      message: '同じユーザの権限が既に付与されています',
    });
  }
  if (code === 'P2003') {
    return new UnprocessableEntityException({
      code: 'RELATED_ENTITY_NOT_FOUND',
      message: '指定された工事またはユーザが存在しません',
    });
  }
  if (code === 'P2025') {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: '指定された権限レコードが見つかりません',
    });
  }
  return e;
}
