import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProjectStatusHistoryService } from './project-status-history.service';

const projectId = '01900000-0000-7000-8000-00000000bbbb';
const alice = { id: '01900000-0000-7000-8000-000000aaaaaa', name: 'Alice' };
const bob = { id: '01900000-0000-7000-8000-000000bbbbbb', name: 'Bob' };

function build() {
  const prisma = {
    project: { findFirst: vi.fn() },
    projectStatusHistory: { findMany: vi.fn() },
  } as unknown as PrismaService;
  return { service: new ProjectStatusHistoryService(prisma), prisma };
}

function row(
  overrides: Partial<{
    id: bigint;
    fromStatus: string | null;
    toStatus: string;
    changedBy: { id: string; name: string } | null;
    changedAt: Date;
    reason: string | null;
  }> = {},
) {
  // ?? を使うと明示的に渡した null が default に置換されてしまうので、
  // `key in overrides` でキー存在を判定して null を許容する。
  const fromStatus = 'fromStatus' in overrides ? overrides.fromStatus : 'in_progress';
  const changedBy = 'changedBy' in overrides ? overrides.changedBy : alice;
  return {
    id: overrides.id ?? 1n,
    projectId,
    fromStatus,
    toStatus: overrides.toStatus ?? 'completed',
    changedById: changedBy?.id ?? alice.id,
    changedAt: overrides.changedAt ?? new Date('2026-05-17T10:00:00Z'),
    reason: overrides.reason ?? null,
    changedBy,
  };
}

describe('ProjectStatusHistoryService.listHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('project が無ければ NotFoundException', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    await expect(service.listHistory(projectId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('changedAt 昇順で整形して返す (id は string、actor は JOIN で name 取得)', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId } as never);
    vi.mocked(prisma.projectStatusHistory.findMany).mockResolvedValue([
      row({
        id: 1n,
        fromStatus: null,
        toStatus: 'bidding',
        changedBy: alice,
        changedAt: new Date('2026-04-01T00:00:00Z'),
      }),
      row({
        id: 2n,
        fromStatus: 'bidding',
        toStatus: 'in_progress',
        changedBy: alice,
        changedAt: new Date('2026-04-15T00:00:00Z'),
        reason: '受注成立',
      }),
      row({
        id: 3n,
        fromStatus: 'in_progress',
        toStatus: 'completed',
        changedBy: bob,
        changedAt: new Date('2026-05-17T00:00:00Z'),
        reason: '社内検収完了',
      }),
    ] as never);

    const events = await service.listHistory(projectId);
    expect(events).toHaveLength(3);
    expect(events[0]?.id).toBe('1');
    expect(events[0]?.fromStatus).toBeNull();
    expect(events[0]?.toStatus).toBe('bidding');
    expect(events[2]?.changedByName).toBe('Bob');
    expect(events[2]?.reason).toBe('社内検収完了');
    // findMany が changedAt asc で呼ばれている
    expect(prisma.projectStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { changedAt: 'asc' } }),
    );
  });

  it('changedBy が null (削除済等) なら changedByName=null', async () => {
    const { service, prisma } = build();
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId } as never);
    vi.mocked(prisma.projectStatusHistory.findMany).mockResolvedValue([
      row({ changedBy: null }),
    ] as never);
    const events = await service.listHistory(projectId);
    expect(events[0]?.changedByName).toBeNull();
  });
});
