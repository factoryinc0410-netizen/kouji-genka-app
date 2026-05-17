import type { ProjectStatus, ProjectStatusHistoryEntry } from '@kgk/schemas';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * T34: 工事ステータスの遷移履歴。
 *
 * project_status_history テーブルを読み出し、changedAt 昇順で
 * 1) いつ、2) 誰が、3) どこから、4) どこへ、5) reason を返す。
 *
 * - DB スキーマ変更なし (T34 で新規テーブルは追加していない)
 * - actor (changedBy) の name は JOIN。削除済ユーザは null
 * - BigInt id は string で返却 (精度ロス防止)
 */
@Injectable()
export class ProjectStatusHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listHistory(projectId: string): Promise<ProjectStatusHistoryEntry[]> {
    // 工事の存在確認 (ABAC は Controller 側、ここは整合性チェック)
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '工事が見つかりません' });
    }

    const rows = await this.prisma.projectStatusHistory.findMany({
      where: { projectId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id.toString(),
      projectId: row.projectId,
      fromStatus: row.fromStatus as ProjectStatus | null,
      toStatus: row.toStatus as ProjectStatus,
      changedById: row.changedById,
      changedAt: row.changedAt.toISOString(),
      reason: row.reason,
      // changedBy は required relation だが、運用上 user 削除のリスクに備え null 許容で扱う
      changedByName: row.changedBy?.name ?? null,
    }));
  }
}
