import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
  lockVersion: 0,
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
    // T34: ensureProjectAllowsAction 用。デフォルトは in_progress (= 全 action 許可)。
    // PROJECT_NOT_EDITABLE をテストする場合は mockResolvedValueOnce で status を差替え。
    project: {
      findFirst: vi.fn().mockResolvedValue({ status: 'in_progress' }),
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
  beforeEach(() => vi.clearAllMocks());

  it('title 更新成功で lockVersion が +1 され、audit に before/after', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      title: 'v1 (改)',
      lockVersion: 1,
    } as never);

    const dto = await service.update(
      projectId,
      budgetId,
      { lockVersion: 0, title: 'v1 (改)' },
      actorId,
      ctx,
    );

    expect(dto.title).toBe('v1 (改)');
    expect(dto.lockVersion).toBe(1);
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'v1 (改)', lockVersion: 1 }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'budgets',
        entityId: budgetId,
      }),
    );
  });

  it('notes 更新成功 (空文字 → null も受け入れ)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      notes: '監督指示 #42 に基づく',
      lockVersion: 1,
    } as never);

    await service.update(
      projectId,
      budgetId,
      { lockVersion: 0, notes: '監督指示 #42 に基づく' },
      actorId,
      ctx,
    );

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: '監督指示 #42 に基づく',
          lockVersion: 1,
        }),
      }),
    );
  });

  it('lockVersion が現状と不一致なら ConflictException(BUDGET_VERSION_MISMATCH)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      lockVersion: 5,
    } as never);

    await expect(
      service.update(projectId, budgetId, { lockVersion: 3, title: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  it('draft 以外で title/notes 編集は 422 BUDGET_NOT_EDITABLE', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      status: 'approved',
    } as never);

    await expect(
      service.update(projectId, budgetId, { lockVersion: 0, title: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  it('対象なしは NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);
    await expect(
      service.update(projectId, budgetId, { lockVersion: 0, title: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // -------------------------------------------------------------------
  // T34: ensureProjectAllowsAction によるガード
  // -------------------------------------------------------------------
  it.each([
    'completed',
    'billing',
    'closed',
  ] as const)('project.status=%s なら 422 PROJECT_NOT_EDITABLE (update)', async (status) => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({ status } as never);
    await expect(
      service.update(projectId, budgetId, { lockVersion: 0, title: 'x' }, actorId, ctx),
    ).rejects.toMatchObject({ response: { code: 'PROJECT_NOT_EDITABLE' } });
    // ガードで落ちるので budget の findFirst は呼ばれない
    expect(prisma.budget.findFirst).not.toHaveBeenCalled();
  });

  it('project が論理削除済 → 404 NOT_FOUND (update)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce(null);
    await expect(
      service.update(projectId, budgetId, { lockVersion: 0, title: 'x' }, actorId, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// =====================================================================
// T34: workflow / revise ガード
// =====================================================================
describe('BudgetsService — T34 project-status guards', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    'billing',
    'closed',
  ] as const)('project.status=%s では submit (workflow) も 422 PROJECT_NOT_EDITABLE', async (status) => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({ status } as never);
    await expect(service.submit(projectId, budgetId, 0, actorId, ctx)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_EDITABLE' },
    });
  });

  it('project.status=completed では submit/approve/reject は許可される (workflow OK)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ status: 'completed' } as never);
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      status: 'pending_approval',
    } as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      status: 'approved',
      lockVersion: 1,
    } as never);
    // PROJECT_NOT_EDITABLE で reject されないこと (= 通過する)
    await expect(service.approve(projectId, budgetId, 0, actorId, ctx)).resolves.toBeDefined();
  });

  it.each([
    'completed',
    'billing',
    'closed',
  ] as const)('project.status=%s では revise も 422 PROJECT_NOT_EDITABLE', async (status) => {
    // revise は buildWithTx を使うが、ensureProjectAllowsAction は $transaction の外で
    // prisma.project.findFirst を直接見る。新しい build を使えば OK。
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({ status } as never);
    await expect(service.revise(projectId, budgetId, 0, actorId, ctx)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_EDITABLE' },
    });
  });
});

// =====================================================================
// T26: Workflow (submit / approve / reject / revise)
// =====================================================================
describe('BudgetsService.submit (draft → pending_approval)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功: status / submitter / submittedAt / lockVersion+1 をセット', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      status: 'pending_approval',
      submittedById: actorId,
      submittedAt: new Date(),
      lockVersion: 1,
    } as never);

    const dto = await service.submit(projectId, budgetId, 0, actorId, ctx);

    expect(dto.status).toBe('pending_approval');
    expect(dto.lockVersion).toBe(1);
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending_approval',
          submitter: { connect: { id: actorId } },
          submittedAt: expect.any(Date),
          lockVersion: 1,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'budgets',
        after: expect.objectContaining({ workflowAction: 'submit' }),
      }),
    );
  });

  it('draft 以外なら 422 INVALID_STATUS_TRANSITION', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      status: 'approved',
    } as never);
    await expect(service.submit(projectId, budgetId, 0, actorId, ctx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  it('lockVersion 不一致なら 409', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      lockVersion: 5,
    } as never);
    await expect(service.submit(projectId, budgetId, 0, actorId, ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('BudgetsService.approve (pending_approval → approved)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功: approver / approvedAt を設定', async () => {
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
      lockVersion: 1,
    } as never);

    const dto = await service.approve(projectId, budgetId, 0, actorId, ctx);
    expect(dto.status).toBe('approved');
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

  it('draft からは 422', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    await expect(service.approve(projectId, budgetId, 0, actorId, ctx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('BudgetsService.reject (pending_approval → draft)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功: submittedBy / submittedAt をクリア、コメントが audit.after.reason に', async () => {
    const { service, prisma, audit } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({
      ...seedBudget,
      status: 'pending_approval',
      submittedById: actorId,
      submittedAt: new Date(),
    } as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...seedBudget,
      status: 'draft',
      submittedById: null,
      submittedAt: null,
      lockVersion: 1,
    } as never);

    await service.reject(
      projectId,
      budgetId,
      { lockVersion: 0, comment: '単価の根拠を追記してください' },
      actorId,
      ctx,
    );

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'draft',
          submitter: { disconnect: true },
          submittedAt: null,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        after: expect.objectContaining({
          workflowAction: 'reject',
          reason: '単価の根拠を追記してください',
        }),
      }),
    );
  });

  it('pending_approval 以外からは 422', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(seedBudget as never);
    await expect(
      service.reject(projectId, budgetId, { lockVersion: 0 }, actorId, ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('BudgetsService.revise (approved → superseded + 新 draft v+1)', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildWithTx() {
    // $transaction(callback) → callback(tx) 形式に対応するモック
    const txBudget = {
      findFirst: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    };
    const txBudgetItem = {
      findMany: vi.fn(),
      create: vi.fn(),
    };
    const tx = { budget: txBudget, budgetItem: txBudgetItem };
    type Tx = typeof tx;
    const prisma = {
      $transaction: vi.fn(async (cb: (t: Tx) => unknown) => cb(tx)),
      // T34: ensureProjectAllowsAction('revise') 用
      project: { findFirst: vi.fn().mockResolvedValue({ status: 'in_progress' }) },
    } as unknown as PrismaService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new BudgetsService(prisma, audit), prisma, audit, tx };
  }

  it('成功: 旧 budget を superseded、新 draft を v+1 で作成、items を level 昇順で複製', async () => {
    const { service, audit, tx } = buildWithTx();
    const approvedBudget = {
      ...seedBudget,
      status: 'approved' as const,
      approvedById: actorId,
      approvedAt: new Date(),
      lockVersion: 3,
    };
    const newId = '01900000-0000-7000-8000-00000000dddd';
    tx.budget.findFirst.mockResolvedValue(approvedBudget);
    tx.budget.update.mockResolvedValue({
      ...approvedBudget,
      status: 'superseded',
      lockVersion: 4,
    });
    tx.budget.aggregate.mockResolvedValue({ _max: { version: 1 } });
    tx.budget.create.mockResolvedValue({
      ...seedBudget,
      id: newId,
      version: 2,
      status: 'draft',
      lockVersion: 0,
      submittedById: null,
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
    });
    // 親→子の 2 件 (level=0, 1)
    const parentItem = {
      id: 'old-parent',
      budgetId: budgetId,
      parentId: null,
      level: 0,
      displayOrder: 1000,
      kind: 'section',
      code: '1',
      name: '直接工事費',
      spec: null,
      unit: null,
      costElement: null,
      quantity: new Prisma.Decimal('0'),
      unitPrice: new Prisma.Decimal('0'),
      amount: new Prisma.Decimal('100'),
      notes: null,
      lockVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const childItem = { ...parentItem, id: 'old-child', parentId: 'old-parent', level: 1 };
    tx.budgetItem.findMany.mockResolvedValue([parentItem, childItem]);
    tx.budgetItem.create
      .mockResolvedValueOnce({ ...parentItem, id: 'new-parent', budgetId: newId })
      .mockResolvedValueOnce({ ...childItem, id: 'new-child', budgetId: newId });

    const dto = await service.revise(projectId, budgetId, 3, actorId, ctx);

    expect(dto.id).toBe(newId);
    expect(dto.status).toBe('draft');
    expect(dto.version).toBe(2);
    expect(dto.lockVersion).toBe(0);
    // 旧 budget は superseded に
    expect(tx.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: budgetId },
        data: expect.objectContaining({ status: 'superseded', lockVersion: 4 }),
      }),
    );
    // 子要素の create で parentId が **新親 ID** に解決されている
    expect(tx.budgetItem.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          budgetId: newId,
          parentId: 'new-parent', // ← idMap で解決された新 ID
          level: 1,
          lockVersion: 0,
        }),
      }),
    );
    // audit log: update (旧) + create (新)
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityId: budgetId,
        after: expect.objectContaining({ workflowAction: 'revise' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityId: newId,
        after: expect.objectContaining({
          workflowAction: 'revise',
          sourceBudgetId: budgetId,
        }),
      }),
    );
  });

  it('approved 以外からは 422 INVALID_STATUS_TRANSITION', async () => {
    const { service, tx } = buildWithTx();
    tx.budget.findFirst.mockResolvedValue({ ...seedBudget, status: 'draft' });
    await expect(service.revise(projectId, budgetId, 0, actorId, ctx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('lockVersion 不一致なら 409', async () => {
    const { service, tx } = buildWithTx();
    tx.budget.findFirst.mockResolvedValue({
      ...seedBudget,
      status: 'approved',
      lockVersion: 5,
    });
    await expect(service.revise(projectId, budgetId, 3, actorId, ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
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
