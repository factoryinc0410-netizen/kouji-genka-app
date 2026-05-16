import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { PROJECT_ACCESS_KEY } from './project-access.decorator';
import { type ProjectAccessMode, ProjectAccessService } from './project-access.service';

/**
 * @RequireProjectAccess('view'|'edit') が付与されたハンドラに対して
 * - セッション (req.session.userId)
 * - URL パラメタ (req.params.id = projectId)
 * を用いて ProjectAccessService に判定を委譲する。
 * 拒否時は ForbiddenException を投げる前に audit_logs に access_denied を残す。
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<ProjectAccessMode | undefined>(
      PROJECT_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!mode) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    const rawProjectId = req.params?.id;
    const projectId = typeof rawProjectId === 'string' ? rawProjectId : undefined;

    if (!userId || !projectId) {
      await this.recordDenied(req, userId ?? null, projectId ?? null, mode, 'missing_context');
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'アクセス権限がありません' });
    }

    const allowed =
      mode === 'edit'
        ? await this.access.canEdit(userId, projectId)
        : await this.access.canView(userId, projectId);

    if (!allowed) {
      await this.recordDenied(req, userId, projectId, mode, 'not_authorized');
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'アクセス権限がありません' });
    }
    return true;
  }

  private async recordDenied(
    req: Request,
    userId: string | null,
    projectId: string | null,
    mode: ProjectAccessMode,
    reason: 'missing_context' | 'not_authorized',
  ): Promise<void> {
    await this.audit.log({
      action: 'access_denied',
      userId,
      entityType: 'projects',
      entityId: projectId,
      after: { mode, projectId, userId, reason },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
