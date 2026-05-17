import { cn } from '@/lib/utils';

/**
 * T35: 依存ゼロの色変化対応 Progress バー。
 *
 * - `value` は **percent** (0〜∞)。100 超は満タン (Math.min(100, value)) で描画
 * - `variant` で色を切替: healthy=emerald, caution=amber, warning=orange, over=red
 * - `data-variant` / `data-value` を露出 (E2E で selector / 期待値検証に使う)
 *
 * 業務文脈: 予算カバレッジ (= 承認済予算 / 請負金額) を可視化する。
 * 100% 超でもバーが画面外にあふれず、色で逼迫度を即把握できる。
 */

export type ProgressVariant = 'healthy' | 'caution' | 'warning' | 'over';

interface Props {
  /** percent (0-100 範囲が標準、>100 は満タン表示) */
  value: number;
  variant: ProgressVariant;
  className?: string;
}

const VARIANT_BAR: Record<ProgressVariant, string> = {
  healthy: 'bg-emerald-500',
  caution: 'bg-amber-500',
  warning: 'bg-orange-500',
  over: 'bg-destructive',
};

export function Progress({ value, variant, className }: Props): React.ReactElement {
  // 0 未満は 0 にクランプ、100 超は 100 にクランプ (バー幅のみ)
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      data-variant={variant}
      data-value={String(value)}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full transition-[width] duration-300', VARIANT_BAR[variant])}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
