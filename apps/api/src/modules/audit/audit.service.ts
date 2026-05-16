import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEvent extends AuditContext {
  userId?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        before: toJson(event.before),
        after: toJson(event.after),
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // 構造化クローン経由で関数や Symbol を落とし、JSONB に格納可能な形に正規化
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
