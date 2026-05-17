import type { ProjectStatus } from '@kgk/schemas';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

/**
 * 工事ステータスバッジ (T34)。
 *
 * 色マッピング:
 * - bidding     = slate   (受注前)
 * - in_progress = blue    (施工中)
 * - completed   = emerald (完工)
 * - billing     = amber   (請求中)
 * - closed      = violet  (完了)
 *
 * Budget の StatusBadge とは別コンポーネント (status 値域が異なるため)。
 */

interface Props {
  status: ProjectStatus;
  size?: 'xs' | 'sm';
  className?: string;
}

const STYLES: Record<ProjectStatus, { dot: string; chip: string }> = {
  bidding: {
    dot: 'bg-slate-500',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  in_progress: {
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
  },
  completed: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  },
  billing: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  },
  closed: {
    dot: 'bg-violet-500',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200',
  },
};

export function ProjectStatusBadge({ status, size = 'sm', className }: Props): React.ReactElement {
  const style = STYLES[status];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span
      data-testid="project-status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${style.chip} ${sizeClass} ${className ?? ''}`}
    >
      <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${style.dot}`} />
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
