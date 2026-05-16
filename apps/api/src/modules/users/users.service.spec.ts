import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const sampleUser = {
  id: '01900000-0000-7000-8000-00000000bbbb',
  email: 'new@kgk.local',
  name: '新規ユーザ',
  isActive: true,
  lastLoginAt: null,
  role: { id: 'r1', code: 'planner', name: '予算編成' },
};

function build() {
  const prisma = {
    $transaction: vi.fn(),
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'r1', code: 'planner', name: '予算編成' }),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new UsersService(prisma, audit), prisma, audit };
}

describe('UsersService.list', () => {
  it('total と items をページング情報と共に返す', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.$transaction).mockResolvedValue([2, [sampleUser, sampleUser]] as never);

    const result = await service.list({ page: 1, limit: 50 });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.email).toBe('new@kgk.local');
  });
});

describe('UsersService.getById', () => {
  it('見つからない場合は NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(service.getById('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('UsersService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ユーザを作成し audit に create を記録する', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.user.create).mockResolvedValue(sampleUser as never);

    const user = await service.create(
      {
        email: 'new@kgk.local',
        password: 'verysecret1234',
        name: '新規ユーザ',
        roleCode: 'planner',
      },
      actorId,
      ctx,
    );

    expect(user.email).toBe('new@kgk.local');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        userId: actorId,
        entityType: 'users',
        entityId: sampleUser.id,
        after: expect.objectContaining({ email: 'new@kgk.local', roleCode: 'planner' }),
      }),
    );
  });

  it('email 重複 (P2002) は ConflictException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.user.create).mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(
        { email: 'dup@kgk.local', password: 'verysecret1234', name: 'x', roleCode: 'planner' },
        actorId,
        ctx,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService.softDelete', () => {
  it('論理削除して audit に delete を記録する', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(sampleUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    await service.softDelete(sampleUser.id, actorId, ctx);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleUser.id },
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', userId: actorId, entityId: sampleUser.id }),
    );
  });
});

describe('UsersService.update', () => {
  it('変更前後を audit にスナップショットとして残す', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(sampleUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...sampleUser,
      name: '更新後',
    } as never);

    const result = await service.update(sampleUser.id, { name: '更新後' }, actorId, ctx);
    expect(result.name).toBe('更新後');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        before: expect.objectContaining({ name: '新規ユーザ' }),
        after: expect.objectContaining({ name: '更新後' }),
      }),
    );
  });
});
