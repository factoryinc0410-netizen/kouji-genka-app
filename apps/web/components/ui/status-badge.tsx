import type { BudgetStatus } from '@kgk/schemas';

/**
 * 予算ステータスバッジ (色 + 日本語ラベル)。
 *
 * - draft            : 灰 (slate)、「作成中」
 * - pending_approval : 青 (blue)、「承認待ち」
 * - approved         : 緑 (emerald)、「承認済」
 * - superseded       : 紫 (violet)、「旧版」
 *
 * BudgetHistoryDrawer の eventType 色 (slate/blue/emerald/violet) と一致させ、
 * UI 全体でのステータス色の認識を統一する。
 */

interface Props {
  status: BudgetStatus;
  /** xs は dropdown 行などに、sm は header の主要箇所に */
  size?: 'xs' | 'sm';
  className?: string;
}

const STYLES: Record<BudgetStatus, { dot: string; chip: string; label: string }> = {
  draft: {
    dot: 'bg-slate-500',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    label: '作成中',
  },
  pending_approval: {
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
    label: '承認待ち',
  },
  approved: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
    label: '承認済',
  },
  superseded: {
    dot: 'bg-violet-500',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200',
    label: '旧版',
  },
};

export function StatusBadge({ status, size = 'xs', className }: Props): React.ReactElement {
  const style = STYLES[status];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span
      data-testid="budget-status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${style.chip} ${sizeClass} ${className ?? ''}`}
    >
      <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
