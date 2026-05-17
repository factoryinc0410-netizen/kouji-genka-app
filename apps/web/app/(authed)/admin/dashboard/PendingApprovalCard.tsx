'use client';

import type { DashboardSummary } from '@kgk/schemas';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAmount } from '@/lib/format';

/**
 * T35: 承認待ち管制塔。
 *
 * - admin: 自分が見える全工事の pending_approval 予算
 * - 非 admin: 自分が submitter のもののみ (自分の申請進捗の確認)
 * - 古い (= 滞留した) ものから順に上位 10 件まで
 * - 各行に「予算を開く →」で `/admin/projects/<projectId>/budget?v=<budgetId>` へ
 *   (T37 の URL 同期で指定した版が初期表示される)
 */

interface Props {
  pending: DashboardSummary['pendingApproval'];
}

export function PendingApprovalCard({ pending }: Props): React.ReactElement {
  const title = pending.audience === 'admin' ? '承認待ち管制塔' : 'マイ申請ステータス';
  const description =
    pending.audience === 'admin'
      ? '承認待ちで滞留している予算 (古い順)'
      : '自分が申請して承認待ちの予算 (古い順)';

  return (
    <Card data-testid="pending-approval-card" data-audience={pending.audience}>
      <CardHeader>
        <CardTitle>
          {title}{' '}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            計 <span data-testid="pending-total">{pending.total}</span> 件
          </span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {pending.items.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            承認待ちの予算はありません。
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.items.map((it) => (
              <li
                key={it.budgetId}
                data-testid="pending-approval-item"
                data-budget-id={it.budgetId}
                data-project-id={it.projectId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-sm text-muted-foreground">
                      {it.projectCode}
                    </span>
                    <span className="truncate font-medium">{it.projectName}</span>
                    <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px]">
                      v{it.version}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>申請: {it.submittedByName ?? '(削除されたユーザ)'}</span>
                    <span>／</span>
                    <span>{formatAge(it.ageSeconds)}</span>
                    <span>／</span>
                    <span className="tabular-nums">予算 {formatAmount(it.totalAmount)} 円</span>
                  </div>
                </div>
                <Link
                  href={`/admin/projects/${it.projectId}/budget?v=${it.budgetId}`}
                  className="inline-flex h-7 items-center rounded-md border border-input bg-background px-2.5 text-xs hover:bg-muted"
                  data-testid="pending-approval-open-link"
                >
                  予算を開く →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** ageSeconds → 「3 日前」/ 「2 時間前」/ 「数分前」 */
function formatAge(seconds: number): string {
  if (seconds < 60) return '数分前';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}
