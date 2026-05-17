'use client';

import type {
  BudgetCoverageItem,
  CoverageAlertCounts,
  CoverageAlertLevel,
  DashboardSummary,
} from '@kgk/schemas';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, type ProgressVariant } from '@/components/ui/progress';
import { ProjectStatusBadge } from '@/components/ui/project-status-badge';
import { formatAmount } from '@/lib/format';

/**
 * T35: 予算カバレッジ (= 承認済予算 / 請負金額) アラート。
 *
 * - 上位 10 件を warst (over → warning → caution → healthy → unknown) 順で
 * - 自作 Progress バー (依存ゼロ) で逼迫度を可視化
 * - 100% 超もバーは満タンで色のみ「超過」に
 * - 「※ 出来高ベースの実績消化率は T38 で別実装予定」を明示
 */

interface Props {
  coverage: DashboardSummary['budgetCoverage'];
}

const LEVEL_BADGE: Record<CoverageAlertLevel, { dot: string; label: string; chip: string }> = {
  healthy: {
    dot: 'bg-emerald-500',
    label: '健全',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  caution: {
    dot: 'bg-amber-500',
    label: '警戒',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  },
  warning: {
    dot: 'bg-orange-500',
    label: '警告',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  },
  over: {
    dot: 'bg-destructive',
    label: '超過',
    chip: 'bg-destructive/10 text-destructive',
  },
  unknown: {
    dot: 'bg-slate-400',
    label: '未集計',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

export function BudgetCoverageCard({ coverage }: Props): React.ReactElement {
  return (
    <Card data-testid="coverage-card">
      <CardHeader>
        <CardTitle>
          予算カバレッジ{' '}
          <span className="text-sm font-normal text-muted-foreground">
            (= 承認済予算 / 請負金額)
          </span>
        </CardTitle>
        <CardDescription>
          ※ 出来高ベースの実績消化率はフェーズ後半 (T38) で別実装されます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertSummary counts={coverage.alertCounts} />

        {coverage.items.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            集計対象の工事がありません。
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {coverage.items.map((it) => (
              <CoverageRow key={it.projectId} item={it} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AlertSummary({ counts }: { counts: CoverageAlertCounts }): React.ReactElement {
  const order: CoverageAlertLevel[] = ['over', 'warning', 'caution', 'healthy', 'unknown'];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">アラート:</span>
      {order.map((lv) => {
        const s = LEVEL_BADGE[lv];
        return (
          <span
            key={lv}
            data-testid="coverage-alert-chip"
            data-level={lv}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${s.chip}`}
          >
            <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${s.dot}`} />
            {s.label} <span className="tabular-nums">{counts[lv]}</span>
          </span>
        );
      })}
    </div>
  );
}

function CoverageRow({ item }: { item: BudgetCoverageItem }): React.ReactElement {
  const { percent, variant } = bpsToPercent(item.coverageBps);
  const badge = LEVEL_BADGE[item.alertLevel];

  return (
    <li
      data-testid="coverage-item"
      data-project-id={item.projectId}
      data-alert-level={item.alertLevel}
      className="py-3"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm text-muted-foreground">{item.projectCode}</span>
        <Link
          href={`/admin/projects/${item.projectId}`}
          className="truncate font-medium hover:underline"
        >
          {item.projectName}
        </Link>
        <ProjectStatusBadge status={item.projectStatus} size="xs" />
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${badge.chip}`}
        >
          <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-1 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap gap-x-3">
          <span className="tabular-nums">売上 {formatAmount(item.contractAmount)} 円</span>
          <span className="tabular-nums">
            予算{' '}
            {item.currentBudgetTotal !== null ? (
              <>{formatAmount(item.currentBudgetTotal)} 円</>
            ) : (
              <span className="italic">(現行予算なし)</span>
            )}
          </span>
        </div>
        <span className="font-mono tabular-nums sm:text-right">
          {item.coverageBps !== null ? `${percent.toFixed(2)}%` : '—'}
        </span>
      </div>
      <Progress className="mt-2" value={percent} variant={variant} />
    </li>
  );
}

/**
 * basis points (string) → percent (number) + Progress variant への解釈。
 * - unknown / null: 0 + healthy 表示 (バーは長さ 0)
 * - 計算は parseInt + 100 で割る。BPS は最大 5〜6 桁なので Number 安全
 *   (API 側で string を返す責務、ここは表示用変換のみ)
 */
function bpsToPercent(bps: string | null): { percent: number; variant: ProgressVariant } {
  if (bps === null) return { percent: 0, variant: 'healthy' };
  const n = Number.parseInt(bps, 10);
  const percent = Number.isFinite(n) ? n / 100 : 0;
  const variant: ProgressVariant =
    percent >= 100 ? 'over' : percent >= 95 ? 'warning' : percent >= 80 ? 'caution' : 'healthy';
  return { percent, variant };
}
