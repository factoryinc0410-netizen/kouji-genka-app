'use client';

import type { ProjectStatus } from '@kgk/schemas';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

/**
 * T34: 工事ステータス遷移の理由入力ダイアログ。
 *
 * - forward: reason は **任意** (空文字許容、API には undefined で送る)
 * - backward: reason は **必須** (空 → 422 PROJECT_STATUS_REASON_REQUIRED)
 *   - admin 限定は上位 (ProjectStatusActions) でボタン表示を制御済
 *
 * 確定時は onConfirm(reason | undefined) を呼ぶ。pending 中は再クリック不可。
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 現在ステータス */
  from: ProjectStatus;
  /** 遷移先 */
  to: ProjectStatus;
  /** 'forward' なら任意、'backward' なら必須 */
  direction: 'forward' | 'backward';
  pending: boolean;
  onConfirm: (reason: string | undefined) => Promise<void> | void;
}

export function ProjectStatusTransitionDialog({
  open,
  onOpenChange,
  from,
  to,
  direction,
  pending,
  onConfirm,
}: Props): React.ReactElement {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // ダイアログ open のたびに入力をリセット
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const reasonRequired = direction === 'backward';
  const reasonError = touched && reasonRequired && trimmed.length === 0;

  const handleConfirm = async (): Promise<void> => {
    setTouched(true);
    if (reasonRequired && trimmed.length === 0) return;
    await onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

  const title =
    direction === 'forward'
      ? `${PROJECT_STATUS_LABELS[to]} に進めますか?`
      : `${PROJECT_STATUS_LABELS[to]} に戻しますか? (差戻し)`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} data-testid="project-status-transition-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {PROJECT_STATUS_LABELS[from]} → {PROJECT_STATUS_LABELS[to]}
            {reasonRequired ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                差戻し: 理由必須
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="ps-reason">
            理由{reasonRequired ? <span className="text-destructive"> *</span> : ' (任意)'}
          </Label>
          <Textarea
            id="ps-reason"
            data-testid="project-status-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            maxLength={500}
            placeholder={reasonRequired ? '差戻しの理由 (必須)' : '社内検収完了 等'}
            aria-invalid={reasonError}
          />
          {reasonError ? (
            <p className="text-xs text-destructive">理由を入力してください</p>
          ) : (
            <p className="text-xs text-muted-foreground">{trimmed.length}/500 文字</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            data-testid="project-status-confirm"
            onClick={handleConfirm}
            disabled={pending || (reasonRequired && trimmed.length === 0)}
          >
            {pending ? '更新中…' : '確定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
