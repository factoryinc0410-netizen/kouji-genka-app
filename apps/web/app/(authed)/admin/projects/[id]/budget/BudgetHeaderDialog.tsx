'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type Budget, UpdateBudgetRequestSchema } from '@kgk/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateBudget } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';

/**
 * Budget ヘッダ (title / notes) を一括編集するダイアログ。
 * - status 変更は **ここでは扱わない** (T26 ワークフロー専用)
 * - title はインライン編集でも変更できるが、notes (長文) のためにダイアログ経由でも編集可能に
 * - 楽観ロック必須: 開いた時点の lockVersion を submit に乗せる
 * - 409 → onConflict、422 (BUDGET_NOT_EDITABLE) → submitError 表示
 */

const Schema = UpdateBudgetRequestSchema;
type FormValues = z.infer<typeof Schema>;

interface Props {
  open: boolean;
  budget: Budget;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  /** 409 BUDGET_VERSION_MISMATCH のとき呼ばれる (ダイアログは閉じる) */
  onConflict: () => void;
}

export function BudgetHeaderDialog({
  open,
  budget,
  projectId,
  onOpenChange,
  onSaved,
  onConflict,
}: Props): React.ReactElement {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      lockVersion: budget.lockVersion,
      title: budget.title ?? undefined,
      notes: budget.notes ?? undefined,
    },
  });

  // budget が変わったら (別予算を選び直したとき等) フォームを再初期化
  useEffect(() => {
    form.reset({
      lockVersion: budget.lockVersion,
      title: budget.title ?? undefined,
      notes: budget.notes ?? undefined,
    });
  }, [budget, form.reset]);

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open]);

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    const body: FormValues = {
      ...values,
      lockVersion: budget.lockVersion,
      title: values.title === '' ? null : values.title,
      notes: values.notes === '' ? null : values.notes,
    };
    try {
      await updateBudget(projectId, budget.id, body);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BUDGET_VERSION_MISMATCH') {
        onConflict();
        return;
      }
      if (err instanceof ApiError && err.code === 'BUDGET_NOT_EDITABLE') {
        setSubmitError('draft 以外の予算は編集できません');
        return;
      }
      setSubmitError(err instanceof ApiError ? err.message : '保存に失敗しました');
    }
  }

  const errors = form.formState.errors;
  const emptyToUndef = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>予算情報の編集</DialogTitle>
          <DialogDescription>
            version {budget.version} のタイトルと備考を編集します。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bh-title">タイトル</Label>
            <Input id="bh-title" {...form.register('title', emptyToUndef)} maxLength={200} />
            {errors.title ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.title.message as string}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bh-notes">備考</Label>
            <Textarea
              id="bh-notes"
              rows={8}
              {...form.register('notes', emptyToUndef)}
              maxLength={5000}
            />
            {errors.notes ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.notes.message as string}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
