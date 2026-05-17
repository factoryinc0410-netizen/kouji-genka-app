'use client';

import type { DashboardSummary } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { getDashboardSummary } from '@/lib/api/dashboard';
import { BudgetCoverageCard } from './BudgetCoverageCard';
import { PendingApprovalCard } from './PendingApprovalCard';
import { ProjectStatusCountsCard } from './ProjectStatusCountsCard';

/**
 * T35: 経営・管理ダッシュボード (管制塔)。
 *
 * - ログイン後の初期遷移先 (apps/web/app/page.tsx で redirect)
 * - ABAC: API 側で `whereForView(actorId)` 適用済 (admin = 全件)
 * - 3 メトリクスを 1 round-trip (`GET /dashboard/summary`) で取得
 */
export default function DashboardPage(): React.ReactElement {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardSummary();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ダッシュボードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!data) return <p>データがありません</p>;

  return (
    <div className="space-y-6" data-testid="dashboard-root">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">工事原価管制ダッシュボード</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            最終更新: {formatDateTime(data.generatedAt)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading}
            data-testid="dashboard-refresh-button"
          >
            {loading ? '更新中…' : '更新'}
          </Button>
        </div>
      </div>

      <ProjectStatusCountsCard counts={data.projectStatusCounts} />
      <PendingApprovalCard pending={data.pendingApproval} />
      <BudgetCoverageCard coverage={data.budgetCoverage} />
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
