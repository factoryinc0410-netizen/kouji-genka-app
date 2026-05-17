'use client';

import { PROJECT_STATUSES, type ProjectStatus, type ProjectStatusCounts } from '@kgk/schemas';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

/**
 * T35: 工事ステータス分布カード。
 *
 * - 5 status の件数を横並びカードで表示
 * - 各カードをクリックで `/admin/projects?status=<status>` にフィルタ遷移
 * - 色は ProjectStatusBadge と同系統 (slate/blue/emerald/amber/violet)
 */

interface Props {
  counts: ProjectStatusCounts;
}

const TILE_STYLES: Record<ProjectStatus, { ring: string; text: string }> = {
  bidding: {
    ring: 'ring-slate-300 hover:ring-slate-400',
    text: 'text-slate-700 dark:text-slate-200',
  },
  in_progress: {
    ring: 'ring-blue-300 hover:ring-blue-400',
    text: 'text-blue-700 dark:text-blue-200',
  },
  completed: {
    ring: 'ring-emerald-300 hover:ring-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-200',
  },
  billing: {
    ring: 'ring-amber-300 hover:ring-amber-400',
    text: 'text-amber-700 dark:text-amber-200',
  },
  closed: {
    ring: 'ring-violet-300 hover:ring-violet-400',
    text: 'text-violet-700 dark:text-violet-200',
  },
};

export function ProjectStatusCountsCard({ counts }: Props): React.ReactElement {
  return (
    <Card data-testid="status-counts-card">
      <CardHeader>
        <CardTitle>工事ステータス分布</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PROJECT_STATUSES.map((s) => {
            const style = TILE_STYLES[s];
            return (
              <Link
                key={s}
                href={`/admin/projects?status=${s}`}
                data-testid="status-count-tile"
                data-status={s}
                className={`flex flex-col items-center justify-center rounded-lg bg-card px-3 py-4 ring-1 transition ${style.ring}`}
              >
                <span className={`text-xs font-medium ${style.text}`}>
                  {PROJECT_STATUS_LABELS[s]}
                </span>
                <span className="mt-1 text-2xl font-semibold tabular-nums">
                  {counts[s]}
                  <span className="ml-0.5 text-xs text-muted-foreground">件</span>
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
