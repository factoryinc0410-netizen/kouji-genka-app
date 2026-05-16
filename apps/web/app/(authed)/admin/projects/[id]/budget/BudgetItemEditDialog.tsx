'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type BudgetItem, COST_ELEMENTS, UpdateBudgetItemRequestSchema } from '@kgk/schemas';
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
import { updateBudgetItem } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';

/**
 * 明細の全項目をまとめて編集するモーダル。
 * - RHF + zodResolver(@kgk/schemas)
 * - quantity/unitPrice は string のまま保持 (number キャスト禁止)
 * - 空文字は null に正規化 (Schema 側 `.nullable().optional()` に整合)
 * - detail 以外 (section/composite) は spec/unit/quantity/unitPrice/costElement を非表示
 * - 楽観ロック: 開いた時点の lockVersion を submit に乗せる。409 は onConflict() で
 *   親 (BudgetTreeTable) のトースト + onRefresh に委譲する。
 */

const Schema = UpdateBudgetItemRequestSchema;
type FormValues = z.infer<typeof Schema>;

const COST_ELEMENT_LABEL: Record<(typeof COST_ELEMENTS)[number], string> = {
  labor: '労務',
  material: '材料',
  subcontract: '外注',
  machine: '機械',
  expense: '経費',
};

interface Props {
  open: boolean;
  item: BudgetItem;
  projectId: string;
  budgetId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** 409 BUDGET_ITEM_VERSION_MISMATCH のとき呼ばれる (ダイアログは閉じる) */
  onConflict: () => void;
}

export function BudgetItemEditDialog({
  open,
  item,
  projectId,
  budgetId,
  onOpenChange,
  onSaved,
  onConflict,
}: Props): React.ReactElement {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isDetail = item.kind === 'detail';

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      lockVersion: item.lockVersion,
      code: item.code ?? undefined,
      name: item.name,
      spec: item.spec ?? undefined,
      unit: item.unit ?? undefined,
      costElement: item.costElement ?? undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes ?? undefined,
    },
  });

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
    }
  }, [open]);

  // ダイアログを開き直したとき (別 item) のために item の変更で reset
  // (form.reset は RHF の安定参照だが、Biome の useExhaustiveDependencies のため明示)
  useEffect(() => {
    form.reset({
      lockVersion: item.lockVersion,
      code: item.code ?? undefined,
      name: item.name,
      spec: item.spec ?? undefined,
      unit: item.unit ?? undefined,
      costElement: item.costElement ?? undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes ?? undefined,
    });
  }, [item, form.reset]);

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    // 空文字 → null/undefined に正規化済 (setValueAs で吸収) だが、ガードとして再正規化
    const body: FormValues = {
      ...values,
      lockVersion: item.lockVersion,
      code: values.code === '' ? null : values.code,
      spec: values.spec === '' ? null : values.spec,
      unit: values.unit === '' ? null : values.unit,
      notes: values.notes === '' ? null : values.notes,
    };
    // detail 以外なら 数量/単価/原価 を抜く (送ってもサーバは無視するが意図を明確に)
    if (!isDetail) {
      delete body.quantity;
      delete body.unitPrice;
      delete body.costElement;
    }
    try {
      await updateBudgetItem(projectId, budgetId, item.id, body);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BUDGET_ITEM_VERSION_MISMATCH') {
        onConflict();
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
          <DialogTitle>明細の編集</DialogTitle>
          <DialogDescription>
            {item.kind === 'section' ? '科目' : item.kind === 'composite' ? '代価' : '明細'}{' '}
            {item.code ?? ''} {item.name} を編集します。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="b-code">コード</Label>
              <Input id="b-code" {...form.register('code', emptyToUndef)} maxLength={50} />
              {errors.code ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.code.message as string}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-name">名称</Label>
              <Input id="b-name" {...form.register('name')} maxLength={200} />
              {errors.name ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.name.message as string}
                </p>
              ) : null}
            </div>

            {isDetail ? (
              <>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="b-spec">仕様</Label>
                  <Input id="b-spec" {...form.register('spec', emptyToUndef)} maxLength={2000} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-unit">単位</Label>
                  <Input id="b-unit" {...form.register('unit', emptyToUndef)} maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-cost">原価区分</Label>
                  <select
                    id="b-cost"
                    {...form.register('costElement', emptyToUndef)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {COST_ELEMENTS.map((t) => (
                      <option key={t} value={t}>
                        {COST_ELEMENT_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-qty">数量</Label>
                  <Input id="b-qty" inputMode="decimal" {...form.register('quantity')} />
                  {errors.quantity ? (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.quantity.message as string}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="b-price">単価 (円)</Label>
                  <Input id="b-price" inputMode="numeric" {...form.register('unitPrice')} />
                  {errors.unitPrice ? (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.unitPrice.message as string}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="b-notes">備考</Label>
              <Textarea
                id="b-notes"
                rows={4}
                {...form.register('notes', emptyToUndef)}
                maxLength={5000}
              />
              {errors.notes ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.notes.message as string}
                </p>
              ) : null}
            </div>
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
