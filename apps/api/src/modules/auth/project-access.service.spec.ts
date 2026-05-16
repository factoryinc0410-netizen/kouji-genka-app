import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProjectAccessService } from './project-access.service';

type Role = { code: 'admin' | 'accounting' | 'planner' | 'field' | 'viewer'; name: string };
type Perm = { canView: boolean; canEdit: boolean } | null;
type Proj = { id: string; managerUserId: string | null } | null;

const SELF = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';
const PROJECT_ID = '01900000-0000-7000-8000-0000000000aa';

function buildSvc(opts: {
  role?: Role['code'] | null;
  project?: Proj;
  perm?: Perm;
  isActive?: boolean;
  deletedAt?: Date | null;
}) {
  const role = opts.role ? ({ id: 'r', code: opts.role, name: opts.role } as Role) : null;
  const user = role
    ? {
        id: SELF,
        deletedAt: opts.deletedAt ?? null,
        isActive: opts.isActive ?? true,
        role,
      }
    : null;
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    project: { findFirst: vi.fn().mockResolvedValue(opts.project ?? null) },
    userProjectPermission: { findUnique: vi.fn().mockResolvedValue(opts.perm ?? null) },
  } as unknown as PrismaService;
  return { svc: new ProjectAccessService(prisma), prisma };
}

const someProject = (managerUserId: string | null): Proj => ({ id: PROJECT_ID, managerUserId });

// ------------------------------------------------------------------
describe('ProjectAccessService.canView', () => {
  it('admin は無条件で true', async () => {
    const { svc } = buildSvc({ role: 'admin', project: someProject(OTHER) });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('accounting は無条件で true', async () => {
    const { svc } = buildSvc({ role: 'accounting' });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('planner: manager 本人なら true (UPP 不要)', async () => {
    const { svc } = buildSvc({ role: 'planner', project: someProject(SELF) });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('planner: UPP.can_view=true なら true', async () => {
    const { svc } = buildSvc({
      role: 'planner',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: false },
    });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('planner: UPP.can_edit=true は can_view を含意する (true)', async () => {
    const { svc } = buildSvc({
      role: 'planner',
      project: someProject(OTHER),
      perm: { canView: false, canEdit: true },
    });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('planner: 権限なしは false', async () => {
    const { svc } = buildSvc({ role: 'planner', project: someProject(OTHER), perm: null });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(false);
  });

  it('viewer: UPP.can_view=true なら閲覧可', async () => {
    const { svc } = buildSvc({
      role: 'viewer',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: false },
    });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(true);
  });

  it('対象 project が削除済み (null 返却) なら閲覧不可', async () => {
    const { svc } = buildSvc({ role: 'planner', project: null });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(false);
  });

  it('ユーザ未存在 / 非アクティブは常に false', async () => {
    const { svc } = buildSvc({ role: null });
    expect(await svc.canView(SELF, PROJECT_ID)).toBe(false);
  });
});

// ------------------------------------------------------------------
describe('ProjectAccessService.canEdit', () => {
  it('admin は無条件で true', async () => {
    const { svc } = buildSvc({ role: 'admin', project: someProject(OTHER) });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(true);
  });

  it('viewer は UPP.can_edit=true があっても false (Defense in depth)', async () => {
    const { svc } = buildSvc({
      role: 'viewer',
      project: someProject(SELF), // manager 本人ですらあっても
      perm: { canView: true, canEdit: true },
    });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(false);
  });

  it('accounting: manager 本人なら true', async () => {
    const { svc } = buildSvc({ role: 'accounting', project: someProject(SELF) });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(true);
  });

  it('accounting: UPP.can_edit=true なら true', async () => {
    const { svc } = buildSvc({
      role: 'accounting',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: true },
    });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(true);
  });

  it('accounting: UPP.can_view のみは編集不可 (false)', async () => {
    const { svc } = buildSvc({
      role: 'accounting',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: false },
    });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(false);
  });

  it('planner: manager 本人なら true', async () => {
    const { svc } = buildSvc({ role: 'planner', project: someProject(SELF) });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(true);
  });

  it('planner: UPP.can_view のみは編集不可 (false)', async () => {
    const { svc } = buildSvc({
      role: 'planner',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: false },
    });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(false);
  });

  it('field: UPP.can_edit=true なら true', async () => {
    const { svc } = buildSvc({
      role: 'field',
      project: someProject(OTHER),
      perm: { canView: true, canEdit: true },
    });
    expect(await svc.canEdit(SELF, PROJECT_ID)).toBe(true);
  });
});

// ------------------------------------------------------------------
describe('ProjectAccessService.whereForView', () => {
  it('admin は全工事 (削除済み除外のみ)', async () => {
    const { svc } = buildSvc({ role: 'admin' });
    expect(await svc.whereForView(SELF)).toEqual({ deletedAt: null });
  });

  it('accounting は全工事 (削除済み除外のみ)', async () => {
    const { svc } = buildSvc({ role: 'accounting' });
    expect(await svc.whereForView(SELF)).toEqual({ deletedAt: null });
  });

  it('planner は manager本人 + UPP (can_view または can_edit) で OR', async () => {
    const { svc } = buildSvc({ role: 'planner' });
    expect(await svc.whereForView(SELF)).toEqual({
      deletedAt: null,
      OR: [
        { managerUserId: SELF },
        {
          permissions: {
            some: { userId: SELF, OR: [{ canView: true }, { canEdit: true }] },
          },
        },
      ],
    });
  });

  it('ユーザ未存在は DENY_ALL (id sentinel)', async () => {
    const { svc } = buildSvc({ role: null });
    const w = await svc.whereForView(SELF);
    expect(w.id).toBe('00000000-0000-0000-0000-000000000000');
  });
});

// ------------------------------------------------------------------
describe('ProjectAccessService.whereForEdit', () => {
  it('admin は全工事', async () => {
    const { svc } = buildSvc({ role: 'admin' });
    expect(await svc.whereForEdit(SELF)).toEqual({ deletedAt: null });
  });

  it('viewer は DENY_ALL', async () => {
    const { svc } = buildSvc({ role: 'viewer' });
    const w = await svc.whereForEdit(SELF);
    expect(w.id).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('accounting は manager本人 + UPP.can_edit=true で OR', async () => {
    const { svc } = buildSvc({ role: 'accounting' });
    expect(await svc.whereForEdit(SELF)).toEqual({
      deletedAt: null,
      OR: [{ managerUserId: SELF }, { permissions: { some: { userId: SELF, canEdit: true } } }],
    });
  });

  it('planner / field も同様の OR', async () => {
    const { svc } = buildSvc({ role: 'planner' });
    expect(await svc.whereForEdit(SELF)).toMatchObject({
      OR: [{ managerUserId: SELF }, { permissions: { some: { userId: SELF, canEdit: true } } }],
    });
  });
});
