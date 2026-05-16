'use client';

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

/**
 * 差戻し用ダイアログ。
 * - 差戻し理由 (comment) は任意。空のまま保存しても OK
 * - 保存ボタンクリック時に親 (onConfirm) に comment 文字列 (空文字なら undefined) を渡す
 * - API 呼出・lockVersion 管理は親 (BudgetWorkflowActions) に委譲
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (comment: string | undefined) => Promise<void> | void;
  pending: boolean;
}

export function BudgetRejectDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: Props): React.ReactElement {
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) setComment('');
  }, [open]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = comment.trim();
    await onConfirm(trimmed === '' ? undefined : trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>予算を差戻す</DialogTitle>
          <DialogDescription>
            予算を draft に戻し、申請者が再編集できる状態にします。
            差戻し理由は任意ですが、入力すると監査ログに記録されます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="br-comment">差戻し理由 (任意)</Label>
            <Textarea
              id="br-comment"
              rows={5}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              placeholder="例: 単価の根拠資料を添付してから再申請してください"
            />
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
            <Button type="submit" disabled={pending}>
              {pending ? '差戻し中…' : '差戻す'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
