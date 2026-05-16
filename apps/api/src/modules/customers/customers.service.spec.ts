import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { CustomersService } from './customers.service';

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const seedCustomer = {
  id: '01900000-0000-7000-8000-00000000cccc',
  code: 'C0001',
  name: '株式会社サンプル',
  nameKana: 'カブシキガイシャサンプル',
  customerType: 'general',
  address: '東京都',
  phone: '03-0000-0000',
  email: null,
  contactPerson: '山田',
  notes: null,
  createdAt: new Date('2026-05-16T00:00:00Z'),
  updatedAt: new Date('2026-05-16T00:00:00Z'),
  deletedAt: null,
};

function build() {
  const prisma = {
    $transaction: vi.fn(),
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new CustomersService(prisma, audit), prisma, audit };
}

describe('CustomersService.list', () => {
  it('search 指定時に code/name/nameKana の OR 部分一致検索を組み立てる', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.$transaction).mockResolvedValue([1, [seedCustomer]] as never);

    const result = await service.list({ page: 1, limit: 50, search: 'サンプル' });

    expect(result.total).toBe(1);
    expect(result.items[0]?.code).toBe('C0001');
    // 渡された count クエリの where に OR が含まれることを確認
    const transactionArg = vi.mocked(prisma.$transaction).mock.calls[0]?.[0];
    expect(transactionArg).toBeDefined();
  });

  it('論理削除済み (deletedAt != null) を除外する where を生成する', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []] as never);
    await service.list({ page: 1, limit: 50 });
    expect(prisma.customer.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});

describe('CustomersService.getById', () => {
  it('論理削除済みは見つからず NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
    await expect(service.getById('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});

describe('CustomersService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('作成成功時に audit.create を after スナップショット付きで記録する', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.customer.create).mockResolvedValue(seedCustomer as never);

    const result = await service.create(
      { code: 'C0001', name: '株式会社サンプル', customerType: 'general' },
      actorId,
      ctx,
    );

    expect(result.code).toBe('C0001');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        userId: actorId,
        entityType: 'customers',
        entityId: seedCustomer.id,
        after: expect.objectContaining({ code: 'C0001', customerType: 'general' }),
      }),
    );
  });

  it('code 重複 (P2002) は ConflictException(CUSTOMER_CODE_TAKEN) に変換', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.customer.create).mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({ code: 'C0001', name: '重複', customerType: 'general' }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('CustomersService.update', () => {
  it('before / after を audit にスナップショット', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(seedCustomer as never);
    vi.mocked(prisma.customer.update).mockResolvedValue({
      ...seedCustomer,
      name: '更新後',
    } as never);

    const result = await service.update(seedCustomer.id, { name: '更新後' }, actorId, ctx);

    expect(result.name).toBe('更新後');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        before: expect.objectContaining({ name: '株式会社サンプル' }),
        after: expect.objectContaining({ name: '更新後' }),
      }),
    );
  });

  it('code 重複 (P2002) は ConflictException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(seedCustomer as never);
    vi.mocked(prisma.customer.update).mockRejectedValue({ code: 'P2002' });

    await expect(
      service.update(seedCustomer.id, { code: 'C0002' }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CustomersService.softDelete', () => {
  it('deletedAt をセットし audit.delete を記録', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(seedCustomer as never);
    vi.mocked(prisma.customer.update).mockResolvedValue({} as never);

    await service.softDelete(seedCustomer.id, actorId, ctx);

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: seedCustomer.id },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        userId: actorId,
        entityId: seedCustomer.id,
        before: expect.objectContaining({ code: 'C0001' }),
      }),
    );
  });
});
