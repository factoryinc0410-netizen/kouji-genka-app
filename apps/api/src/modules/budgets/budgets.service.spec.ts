import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { BudgetsService } from './budgets.service';

const actorId = '01900000-0000-7000-8000-00000000aaaa';
const projectId = '01900000-0000-7000-8000-00000000bbbb';
const budgetId = '01900000-0000-7000-8000-00000000cccc';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const seedBudget = {
  id: budgetId,
  projectId,
  version: 1,
  status: 'draft' as const,
  title: '初期予算 (v1)',
  totalAmount: new Prisma.Decimal('2237100'),
  submittedById: null,
  submittedAt: null,
  approvedById: null,
  approvedAt: null,
  notes: null,
  createdAt: new Date('2026-05-16T00:00:00Z'),
  updatedAt: new Date('2026-05-16T00:00:00Z'),
  deletedAt: null,
};

function build() {
  const prisma = {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new BudgetsService(prisma, audit), prisma, audit };
}

// =====================================================================
describe('BudgetsService.list / getById', () => {
  it('list は version desc で返し、totalAmount は string', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findMany).mockResolvedValue([seedBudget] as never);
    const res = await service.list(projectId);
    expect(res.total).toBe(1);
    expect(res.items[0]?.totalAmount).toBe('2237100');
    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId, deletedAt: null },
        orderBy: { version: 'desc' },
      }),
    );
  });

  it('getById で見つからなければ NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);
    await expect(service.getById(projectId, budgetId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// =====================================================================
describe('BudgetsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('version 未指定なら max(version)+1 を採番', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.aggregate).mockResolvedValue({ _max: { version: 3 } } as never);
    vi.mocked(prisma.budget.create).mockResolvedValue({ ...seedBudget, version: 4 } as never);

    const dto = await service.create(projectId, { title: 'v4' }, actorId, ctx);

    expect(dto.version).toBe(4);
    expect(prisma.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId, version: 4, status: 'draft' }),
      }),
    );
  });

  it('既存 0 件なら version=1', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.aggregate).mockResolvedValue({ _max: { version: null } } as never);
    vi.mocked(prisma.budget.create).mockResolvedValue(seedBudget as never);

    await service.create(projectId, {}, actorId, ctx);

    expect(prisma.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
    );
  });

  it('P2002 (重複 version) は ConflictException(BUDGET_VERSION_TAKEN)', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.budget.aggregate).mockResolvedValue({ _max: { version: 0 } } as never);
    vi.mocked(prisma.budget.create).mockRejectedValue({ code: 'P2002' });
    await expect(service.create(projectId, { version: 1 }, actorId, ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});

// =====================================================================
describe('BudgetsService.update', () => {
  it('status を pending_approval にすると submittedBy / submittedAt が設定される', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      status: 'pending_approval',
      submittedById: actorId,
      submittedAt: new Date(),
    } as never);

    await service.update(projectId, budgetId, { status: 'pending_approval' }, actorId, ctx);

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending_approval',
          submitter: { connect: { id: actorId } },
          submittedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('status を approved にすると approver / approvedAt が設定される', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      status: 'pending_approval',
      submittedById: actorId,
      submittedAt: new Date(),
    } as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      status: 'approved',
      approvedById: actorId,
      approvedAt: new Date(),
    } as never);

    await service.update(projectId, budgetId, { status: 'approved' }, actorId, ctx);

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'approved',
          approver: { connect: { id: actorId } },
          approvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('対象なしは NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);
    await expect(
      service.update(projectId, budgetId, { title: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// =====================================================================
describe('BudgetsService.softDelete', () => {
  it('deletedAt をセットし audit.delete を記録', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({} as never);

    await service.softDelete(projectId, budgetId, actorId, ctx);

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: budgetId },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entityType: 'budgets', entityId: budgetId }),
    );
  });
});
