import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type ProjectAccessMode = 'view' | 'edit';

/**
 * 工事単位 ABAC (Attribute-Based Access Control)。
 *
 * 認可マトリクス (REQUIREMENTS §10.2 + 運用上の確定事項):
 *
 * | role       | View                                                        | Edit                                                    |
 * |------------|-------------------------------------------------------------|---------------------------------------------------------|
 * | admin      | true (全工事バイパス)                                        | true (全工事バイパス)                                    |
 * | accounting | true (全工事バイパス)                                        | manager本人 OR UPP.can_edit=true                        |
 * | planner    | manager本人 OR UPP.can_view=true OR UPP.can_edit=true       | manager本人 OR UPP.can_edit=true                        |
 * | field      | 同上                                                         | 同上                                                    |
 * | viewer     | 同上                                                         | 不可 (どんな UPP を持っていても false)                  |
 *
 * - 認可判定対象の Project は deletedAt=null のものに限る。
 * - 利用しているユーザが論理削除済 / 非アクティブの場合は常に false。
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 個別判定 ----------

  async canView(userId: string, projectId: string): Promise<boolean> {
    const user = await this.loadActiveUser(userId);
    if (!user) return false;
    const role = user.role.code;
    if (role === 'admin' || role === 'accounting') return true;
    return this.hasProjectPermission(userId, projectId, 'view');
  }

  async canEdit(userId: string, projectId: string): Promise<boolean> {
    const user = await this.loadActiveUser(userId);
    if (!user) return false;
    const role = user.role.code;
    if (role === 'admin') return true;
    // viewer は UPP.can_edit があっても常に拒否 (Defense in depth)
    if (role === 'viewer') return false;
    // accounting / planner / field は同一ロジック (manager本人 or UPP.can_edit)
    return this.hasProjectPermission(userId, projectId, 'edit');
  }

  // ---------- 一覧クエリ用 where ----------

  /**
   * 一覧取得 (閲覧範囲) 用の Prisma where。
   * 削除済プロジェクトは常に除外し、ロールに応じて可視レコードを絞る。
   * ユーザが存在しない場合は「マッチしないクエリ」を返す (安全側)。
   */
  async whereForView(userId: string): Promise<Prisma.ProjectWhereInput> {
    const user = await this.loadActiveUser(userId);
    if (!user) return DENY_ALL;

    const role = user.role.code;
    if (role === 'admin' || role === 'accounting') {
      return { deletedAt: null };
    }
    // planner / field / viewer
    return {
      deletedAt: null,
      OR: [
        { managerUserId: userId },
        {
          permissions: {
            some: { userId, OR: [{ canView: true }, { canEdit: true }] },
          },
        },
      ],
    };
  }

  /**
   * 編集権限付き一覧 (将来の bulk edit 等で利用) 用の Prisma where。
   * - admin: 全工事
   * - viewer: なし
   * - accounting / planner / field: manager本人 OR UPP.can_edit=true
   */
  async whereForEdit(userId: string): Promise<Prisma.ProjectWhereInput> {
    const user = await this.loadActiveUser(userId);
    if (!user) return DENY_ALL;

    const role = user.role.code;
    if (role === 'admin') return { deletedAt: null };
    if (role === 'viewer') return DENY_ALL;

    return {
      deletedAt: null,
      OR: [{ managerUserId: userId }, { permissions: { some: { userId, canEdit: true } } }],
    };
  }

  // ---------- internal ----------

  private async loadActiveUser(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { role: true },
    });
  }

  /**
   * 対象 project が存在し論理削除されていない前提で、
   * manager本人 or UserProjectPermission に該当があるかを判定。
   */
  private async hasProjectPermission(
    userId: string,
    projectId: string,
    mode: ProjectAccessMode,
  ): Promise<boolean> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, managerUserId: true },
    });
    if (!project) return false;
    if (project.managerUserId === userId) return true;

    const perm = await this.prisma.userProjectPermission.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { canView: true, canEdit: true },
    });
    if (!perm) return false;
    if (mode === 'edit') return perm.canEdit;
    // view は can_view = true または can_edit = true (編集権限は閲覧を含意)
    return perm.canView || perm.canEdit;
  }
}

/**
 * どの Project とも一致しないことを保証する where。
 * 「ユーザがいないので空 list」を表現するために id 不在 UUID を指定。
 */
const DENY_ALL: Prisma.ProjectWhereInput = {
  id: '00000000-0000-0000-0000-000000000000',
  deletedAt: null,
};
