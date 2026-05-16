import type {
  CreateUserRequest,
  ListUsersQuery,
  ListUsersResponse,
  PublicUser,
  RoleCode,
  UpdateUserRequest,
} from '@kgk/schemas';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';

const ARGON2_OPTS = {
  timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
  memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65_536),
  parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery): Promise<ListUsersResponse> {
    const where = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: items.map(toPublicUser),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!user)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'ユーザが見つかりません' });
    return toPublicUser(user);
  }

  async create(input: CreateUserRequest, actorId: string, ctx: AuditContext): Promise<PublicUser> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: input.roleCode } });
    const passwordHash = await hash(input.password, ARGON2_OPTS);

    try {
      const created = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          roleId: role.id,
        },
        include: { role: true },
      });
      await this.audit.log({
        action: 'create',
        userId: actorId,
        entityType: 'users',
        entityId: created.id,
        after: { email: created.email, name: created.name, roleCode: created.role.code },
        ...ctx,
      });
      return toPublicUser(created);
    } catch (e: unknown) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: '同じメールアドレスのユーザが既に存在します',
        });
      }
      throw e;
    }
  }

  async update(
    id: string,
    input: UpdateUserRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<PublicUser> {
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!before)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'ユーザが見つかりません' });

    const data: Record<string, unknown> = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password !== undefined) data.passwordHash = await hash(input.password, ARGON2_OPTS);
    if (input.roleCode !== undefined) {
      const role = await this.prisma.role.findUniqueOrThrow({ where: { code: input.roleCode } });
      data.roleId = role.id;
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data,
        include: { role: true },
      });
      await this.audit.log({
        action: 'update',
        userId: actorId,
        entityType: 'users',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
        ...ctx,
      });
      return toPublicUser(updated);
    } catch (e: unknown) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: '同じメールアドレスのユーザが既に存在します',
        });
      }
      throw e;
    }
  }

  async softDelete(id: string, actorId: string, ctx: AuditContext): Promise<void> {
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!before)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'ユーザが見つかりません' });

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.log({
      action: 'delete',
      userId: actorId,
      entityType: 'users',
      entityId: id,
      before: snapshot(before),
      ...ctx,
    });
  }
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  role: { code: string; name: string };
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    role: { code: user.role.code as RoleCode, name: user.role.name },
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

function snapshot(user: {
  email: string;
  name: string;
  isActive: boolean;
  role: { code: string };
}) {
  return { email: user.email, name: user.name, isActive: user.isActive, roleCode: user.role.code };
}

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002'
  );
}
