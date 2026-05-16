'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONSTRUCTION_TYPES,
  CreateProjectRequestSchema,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Project,
  UpdateProjectRequestSchema,
} from '@kgk/schemas';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { ApiError } from '@/lib/api/client';
import { listCustomers } from '@/lib/api/customers';
import { createProject, updateProject } from '@/lib/api/projects';
import { formatAmountForInput, sanitizeAmountInput } from '@/lib/format';
import { CONSTRUCTION_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/labels';

/**
 * RHF + Zod resolver。
 * - 厳格な zod は @kgk/schemas の API 用と同じものを使う (contractAmount=^\d+$ 等)。
 * - contractAmount は内部状態として「カンマ入り表示」で持ち、submit 前に
 *   sanitizeAmountInput で純粋な数字文字列に直してから zod 検証 → API へ。
 * - 409 PROJECT_CODE_TAKEN は setError('code', ...) でフィールドエラー化。
 */

type Mode = 'create' | 'edit';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  mode: Mode;
  /** edit のときの初期値 */
  initial?: Project;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const CreateSchema = CreateProjectRequestSchema;
const UpdateSchema = UpdateProjectRequestSchema;

type CreateFormValues = z.infer<typeof CreateSchema>;
type UpdateFormValues = z.infer<typeof UpdateSchema>;

export function ProjectFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props): React.ReactElement {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listCustomers({ limit: 200 })
      .then((res) => setCustomers(res.items.map((c) => ({ id: c.id, code: c.code, name: c.name }))))
      .catch(() => setCustomers([]));
  }, [open]);

  if (mode === 'edit' && initial) {
    return (
      <EditForm
        key={initial.id}
        open={open}
        initial={initial}
        customers={customers}
        submitError={submitError}
        setSubmitError={setSubmitError}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    );
  }
  return (
    <CreateForm
      open={open}
      customers={customers}
      submitError={submitError}
      setSubmitError={setSubmitError}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

// --------------------------------------------------------------------
// Create
// --------------------------------------------------------------------

interface CreateFormProps {
  open: boolean;
  customers: CustomerOption[];
  submitError: string | null;
  setSubmitError: (v: string | null) => void;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function CreateForm({
  open,
  customers,
  submitError,
  setSubmitError,
  onOpenChange,
  onSaved,
}: CreateFormProps): React.ReactElement {
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(CreateSchema),
    defaultValues: {
      code: '',
      name: '',
      customerId: '',
      status: 'bidding',
      projectType: 'private',
      constructionType: 'building',
      contractAmount: '0',
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
      setSubmitError(null);
    }
  }, [open, form, setSubmitError]);

  async function onSubmit(values: CreateFormValues): Promise<void> {
    setSubmitError(null);
    try {
      await createProject(values);
      onSaved();
    } catch (err) {
      handleApiError(err, form.setError, setSubmitError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新規工事</DialogTitle>
          <DialogDescription>工事番号と件名は必須です。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormFields form={form} customers={customers} includeCustomerSelector />
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
              {form.formState.isSubmitting ? '作成中…' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------
// Edit
// --------------------------------------------------------------------

interface EditFormProps extends CreateFormProps {
  initial: Project;
}

function EditForm({
  open,
  initial,
  customers,
  submitError,
  setSubmitError,
  onOpenChange,
  onSaved,
}: EditFormProps): React.ReactElement {
  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(UpdateSchema),
    defaultValues: {
      code: initial.code,
      name: initial.name,
      customerId: initial.customerId,
      status: initial.status,
      projectType: initial.projectType,
      constructionType: initial.constructionType,
      contractAmount: initial.contractAmount,
      location: initial.location ?? undefined,
      notes: initial.notes ?? undefined,
    },
  });

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open, setSubmitError]);

  async function onSubmit(values: UpdateFormValues): Promise<void> {
    setSubmitError(null);
    try {
      await updateProject(initial.id, values);
      onSaved();
    } catch (err) {
      handleApiError(err, form.setError, setSubmitError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>工事の編集</DialogTitle>
          <DialogDescription>{initial.code} を更新します。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormFields form={form} customers={customers} includeCustomerSelector />
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

// --------------------------------------------------------------------
// 共通フィールド
// --------------------------------------------------------------------

interface FormFieldsProps {
  // create / update のどちらでも使えるよう any 形ではなく union を unknown 経由で受ける
  form: ReturnType<typeof useForm<CreateFormValues>> | ReturnType<typeof useForm<UpdateFormValues>>;
  customers: CustomerOption[];
  includeCustomerSelector: boolean;
}

function FormFields({ form, customers, includeCustomerSelector }: FormFieldsProps) {
  // 型の合流は使わず、必要なメソッドだけ取り出す (any 不使用)
  const register = form.register as ReturnType<typeof useForm<CreateFormValues>>['register'];
  const formState = form.formState;
  const control = form.control as ReturnType<typeof useForm<CreateFormValues>>['control'];

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [customers],
  );

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="p-code">工事番号</Label>
        <Input id="p-code" {...register('code')} maxLength={50} />
        {formState.errors.code ? (
          <p className="text-xs text-destructive" role="alert">
            {formState.errors.code.message as string}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-name">件名</Label>
        <Input id="p-name" {...register('name')} maxLength={200} />
        {formState.errors.name ? (
          <p className="text-xs text-destructive" role="alert">
            {formState.errors.name.message as string}
          </p>
        ) : null}
      </div>

      {includeCustomerSelector ? (
        <div className="col-span-2 space-y-2">
          <Label htmlFor="p-customer">取引先</Label>
          <select
            id="p-customer"
            {...register('customerId')}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">選択してください</option>
            {customerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {formState.errors.customerId ? (
            <p className="text-xs text-destructive" role="alert">
              {formState.errors.customerId.message as string}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="p-status">ステータス</Label>
        <select
          id="p-status"
          {...register('status')}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-type">工事区分</Label>
        <select
          id="p-type"
          {...register('projectType')}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROJECT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-ctype">構造種別</Label>
        <select
          id="p-ctype"
          {...register('constructionType')}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {CONSTRUCTION_TYPES.map((c) => (
            <option key={c} value={c}>
              {CONSTRUCTION_TYPE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-amount">請負金額 (円)</Label>
        <Controller
          control={control}
          name="contractAmount"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="p-amount"
                inputMode="numeric"
                // 表示はカンマ区切り、内部値は数字文字列で保持
                value={formatAmountForInput(field.value ?? '')}
                onChange={(e) => field.onChange(sanitizeAmountInput(e.target.value))}
                onBlur={field.onBlur}
              />
              {fieldState.error ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldState.error.message}
                </p>
              ) : null}
            </>
          )}
        />
      </div>

      <div className="col-span-2 space-y-2">
        <Label htmlFor="p-location">所在地</Label>
        <Input id="p-location" {...register('location')} maxLength={2000} />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// エラーハンドリング
// --------------------------------------------------------------------

type SetFieldError = (name: 'code' | 'customerId', err: { type: string; message: string }) => void;

function handleApiError(
  err: unknown,
  setError: SetFieldError,
  setSubmitError: (v: string | null) => void,
): void {
  if (err instanceof ApiError) {
    if (err.code === 'PROJECT_CODE_TAKEN') {
      setError('code', {
        type: 'server',
        message: 'この工事番号は既に登録されています',
      });
      return;
    }
    if (err.code === 'RELATED_ENTITY_NOT_FOUND') {
      setError('customerId', {
        type: 'server',
        message: '指定された取引先または担当者が見つかりません',
      });
      return;
    }
    setSubmitError(err.message);
    return;
  }
  setSubmitError('保存に失敗しました');
}
