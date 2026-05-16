'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { exportBudget } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';

/**
 * Excel エクスポートボタン (T27)。
 *
 * - status 不問で常時表示 (approved / superseded も記録目的で必要)
 * - クリック → blob 取得 → <a download> を programmatic click → revoke
 * - 成功時は toast、失敗時は ApiError から code/message を出す
 */

interface Props {
  projectId: string;
  budgetId: string;
}

export function BudgetExportButton({ projectId, budgetId }: Props): React.ReactElement {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const handleClick = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      const { blob, filename } = await exportBudget(projectId, budgetId);
      // ブラウザに「ダウンロード」イベントとして発火させる
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 次の tick で revoke (Safari 等で click 前に revoke すると壊れる対策)
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.show({ kind: 'success', title: `${filename} をダウンロードしました` });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Excel 出力に失敗しました',
        description: err instanceof ApiError ? err.message : '不明なエラー',
      });
    } finally {
      setPending(false);
    }
  }, [pending, projectId, budgetId, toast]);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
      aria-label="Excel 出力"
    >
      <DownloadIcon />
      {pending ? '生成中…' : 'Excel 出力'}
    </Button>
  );
}

/** 依存ゼロの小さな download SVG (lucide-react を追加しない) */
function DownloadIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
      className="mr-1 inline-block"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
