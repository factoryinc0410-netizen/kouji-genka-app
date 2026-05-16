import type { RoleCode } from '@kgk/schemas';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ROLES_METADATA_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RoleCode[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    if (!userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'アクセス権限がありません' });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { role: true },
    });

    const code = user?.role.code as RoleCode | undefined;
    if (!user || !code || !required.includes(code)) {
      await this.audit.log({
        action: 'access_denied',
        userId,
        entityType: this.routeKey(req),
        entityId: null,
        after: { requiredRoles: required, actualRole: code ?? null, path: req.originalUrl },
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'アクセス権限がありません',
      });
    }

    return true;
  }

  private routeKey(req: Request): string {
    return `${req.method} ${req.route?.path ?? req.path}`;
  }
}
