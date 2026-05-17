import {
  type BudgetCoverageItem,
  type CoverageAlertCounts,
  type CoverageAlertLevel,
  type DashboardSummary,
  type PendingApprovalAudience,
  type PendingApprovalItem,
  type ProjectStatus,
  type ProjectStatusCounts,
} from '@kgk/schemas';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProjectAccessService } from '../auth/project-access.service';

/**
 * T35: 経営・管理ダッシュボードのサマリ取得。
 *
 * 設計判断:
 * - **1 endpoint** (`GET /dashboard/summary`) で 3 メトリクスを 1 round-trip 返却
 * - **ABAC**: `ProjectAccessService.whereForView(actorId)` を全クエリの where に合成
 * - **承認待ち**: admin は可視全工事 / 非 admin は自分が submitter のもの
 * - **カバレッジ**: 「現行予算」 = approved or superseded のうち version 最大
 *   (T31 で確立した「承認された最新版 = 正本」と整合)
 * - **Decimal 計算**: Prisma.Decimal で完結、最終結果は basis points 整数 string
 *
 * Decimal ルール (CLAUDE.md 厳守):
 *   string → new Prisma.Decimal(...) → mul/div → .toFixed(0) → string
 */

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async getSummary(actorId: string): Promise<DashboardSummary> {
    // ABAC where と actor role を並列取得 (どちらも以降の集計に必要)
    const [visibleProjectWhere, actor] = await Promise.all([
      this.access.whereForView(actorId),
      this.prisma.user.findFirst({
        where: { id: actorId },
        select: { role: { select: { code: true } } },
      }),
    ]);
    const isAdmin = actor?.role.code === 'admin';
    const audience: PendingApprovalAudience = isAdmin ? 'admin' : 'self';

    // 3 メトリクスを並列 fetch
    const [statusCounts, pending, coverage] = await Promise.all([
      this.fetchStatusCounts(visibleProjectWhere),
      this.fetchPendingApproval(visibleProjectWhere, isAdmin, actorId),
      this.fetchBudgetCoverage(visibleProjectWhere),
    ]);

    return {
      projectStatusCounts: statusCounts,
      pendingApproval: {
        audience,
        total: pending.total,
        items: pending.items,
      },
      budgetCoverage: coverage,
      generatedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------
  // (α) Status counts
  // -----------------------------------------------------------------

  private async fetchStatusCounts(
    visibleWhere: Prisma.ProjectWhereInput,
  ): Promise<ProjectStatusCounts> {
    const groups = await this.prisma.project.groupBy({
      by: ['status'],
      where: visibleWhere,
      _count: { _all: true },
    });

    // 5 status すべてのキーを 0 で埋めて、API レスポンスを安定させる
    const counts: ProjectStatusCounts = {
      bidding: 0,
      in_progress: 0,
      completed: 0,
      billing: 0,
      closed: 0,
    };
    for (const g of groups) {
      const key = g.status as ProjectStatus;
      if (key in counts) {
        counts[key] = g._count._all;
      }
    }
    return counts;
  }

  // -----------------------------------------------------------------
  // (β) Pending approval (申請中の予算)
  // -----------------------------------------------------------------

  private async fetchPendingApproval(
    visibleWhere: Prisma.ProjectWhereInput,
    isAdmin: boolean,
    actorId: string,
  ): Promise<{ total: number; items: PendingApprovalItem[] }> {
    const where: Prisma.BudgetWhereInput = {
      status: 'pending_approval',
      deletedAt: null,
      project: visibleWhere,
      // 非 admin は「自分が申請したもの」のみ
      ...(isAdmin ? {} : { submittedById: actorId }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.budget.findMany({
        where,
        include: {
          project: { select: { code: true, name: true } },
          submitter: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: 'asc' }, // 古い (= 滞留した) ものから表示
        take: 10,
      }),
      this.prisma.budget.count({ where }),
    ]);

    const now = Date.now();
    const items: PendingApprovalItem[] = rows.map((b) => ({
      budgetId: b.id,
      projectId: b.projectId,
      projectCode: b.project.code,
      projectName: b.project.name,
      version: b.version,
      totalAmount: b.totalAmount.toString(),
      submittedById: b.submittedById,
      submittedByName: b.submitter?.name ?? null,
      submittedAt: b.submittedAt?.toISOString() ?? null,
      ageSeconds: b.submittedAt
        ? Math.max(0, Math.floor((now - b.submittedAt.getTime()) / 1000))
        : 0,
    }));

    return { total, items };
  }

  // -----------------------------------------------------------------
  // (γ) Budget coverage (= 現行予算 / 請負金額)
  // -----------------------------------------------------------------

  private async fetchBudgetCoverage(
    visibleWhere: Prisma.ProjectWhereInput,
  ): Promise<{ items: BudgetCoverageItem[]; alertCounts: CoverageAlertCounts }> {
    // 可視工事を 1 クエリで取得し、関連の「現行候補 budget」(approved/superseded のうち version 最大)
    // を 1 件だけ JOIN。N+1 を避けつつ Decimal は app 層で計算する。
    const projects = await this.prisma.project.findMany({
      where: visibleWhere,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        contractAmount: true,
        budgets: {
          where: { status: { in: ['approved', 'superseded'] }, deletedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, totalAmount: true },
        },
      },
    });

    const items: BudgetCoverageItem[] = projects.map((p) => {
      const current = p.budgets[0] ?? null;
      const { coverageBps, alertLevel } = computeCoverage(
        p.contractAmount,
        current?.totalAmount ?? null,
      );
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        projectStatus: p.status as ProjectStatus,
        contractAmount: p.contractAmount.toString(),
        currentBudgetId: current?.id ?? null,
        currentBudgetTotal: current?.totalAmount.toString() ?? null,
        coverageBps,
        alertLevel,
      };
    });

    // 全件のアラートレベル分布
    const alertCounts: CoverageAlertCounts = {
      healthy: 0,
      caution: 0,
      warning: 0,
      over: 0,
      unknown: 0,
    };
    for (const it of items) alertCounts[it.alertLevel] += 1;

    // ソート: over > warning > caution > healthy > unknown、同レベル内は bps desc
    items.sort(compareCoverageItems);

    return { items: items.slice(0, 10), alertCounts };
  }
}

// =====================================================================
// Coverage 計算 / 分類 / ソート (Pure helper)
// =====================================================================

const ALERT_PRIORITY: Record<CoverageAlertLevel, number> = {
  over: 0,
  warning: 1,
  caution: 2,
  healthy: 3,
  unknown: 4,
};

const BPS_PERCENT = 10000; // 100.00% = 10000 bps

/**
 * カバレッジを basis points 整数 string で返し、alertLevel を分類。
 *
 * - 0 除算ガード: contract.isZero() なら coverageBps=null, alertLevel='unknown'
 * - budget なし: budgetTotal === null なら coverageBps=null, alertLevel='unknown'
 * - 計算式: budgetTotal / contractAmount * 10000 を整数 (HALF_UP) に
 *
 * 桁あふれ防止: 15 桁 × 10000 でも Prisma.Decimal は内部 38 桁精度 (decimal.js-light)
 * のため安全。Number への変換はここでは一切しない。
 */
export function computeCoverage(
  contract: Prisma.Decimal | string,
  budgetTotal: Prisma.Decimal | string | null,
): { coverageBps: string | null; alertLevel: CoverageAlertLevel } {
  const c = contract instanceof Prisma.Decimal ? contract : new Prisma.Decimal(contract);
  if (c.isZero()) return { coverageBps: null, alertLevel: 'unknown' };
  if (budgetTotal === null) return { coverageBps: null, alertLevel: 'unknown' };
  const b = budgetTotal instanceof Prisma.Decimal ? budgetTotal : new Prisma.Decimal(budgetTotal);
  const bps = b.div(c).mul(BPS_PERCENT).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return { coverageBps: bps.toFixed(0), alertLevel: classifyByBps(bps) };
}

/** bps → alertLevel (over / warning / caution / healthy) */
function classifyByBps(bps: Prisma.Decimal): CoverageAlertLevel {
  // 比較は Decimal 同士で行い、Number への変換を避ける
  if (bps.gte(BPS_PERCENT)) return 'over'; // >= 100.00%
  if (bps.gte(9500)) return 'warning'; // >= 95.00%
  if (bps.gte(8000)) return 'caution'; // >= 80.00%
  return 'healthy';
}

/**
 * 比較関数: alertLevel 優先度 → 同レベル内は bps desc (=「より逼迫」が先)。
 * unknown 同士は contract amount desc (大きい工事を先に出すと監視しやすい)。
 */
function compareCoverageItems(a: BudgetCoverageItem, b: BudgetCoverageItem): number {
  const pa = ALERT_PRIORITY[a.alertLevel];
  const pb = ALERT_PRIORITY[b.alertLevel];
  if (pa !== pb) return pa - pb;
  if (a.coverageBps !== null && b.coverageBps !== null) {
    // 文字列でも整数 bps なので Decimal で比較
    return new Prisma.Decimal(b.coverageBps).cmp(new Prisma.Decimal(a.coverageBps));
  }
  // unknown vs unknown: contractAmount desc (大規模工事優先)
  return new Prisma.Decimal(b.contractAmount).cmp(new Prisma.Decimal(a.contractAmount));
}
