'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCustomerRequestSchema,
  CUSTOMER_TYPES,
  type Customer,
  UpdateCustomerRequestSchema,
} from '@kgk/schemas';
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
import { ApiError } from '@/lib/api/client';
import { createCustomer, updateCustomer } from '@/lib/api/customers';
import { CUSTOMER_TYPE_LABELS } from '@/lib/labels';

/**
 * 取引先マスタの作成/編集ダイアログ。
 * - RHF + zodResolver で @kgk/schemas の API スキーマをそのまま流用
 * - 409 CUSTOMER_CODE_TAKEN は setError('code') でフィールドエラー化
 */

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  /** edit 時の初期値 */
  initial?: Customer;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const CreateSchema = CreateCustomerRequestSchema;
const UpdateSchema = UpdateCustomerRequestSchema;
type CreateFormValues = z.infer<typeof CreateSchema>;
type UpdateFormValues = z.infer<typeof UpdateSchema>;

export function CustomerFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props): React.ReactElement {
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (mode === 'edit' && initial) {
    return (
      <EditForm
        key={initial.id}
        open={open}
        initial={initial}
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
  submitError: string | null;
  setSubmitError: (v: string | null) => void;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function CreateForm({
  open,
  submitError,
  setSubmitError,
  onOpenChange,
  onSaved,
}: CreateFormProps): React.ReactElement {
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { code: '', name: '', customerType: 'general' },
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
      await createCustomer(values);
      onSaved();
    } catch (err) {
      handleApiError(err, form.setError, setSubmitError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新規取引先</DialogTitle>
          <DialogDescription>取引先コードと名称、区分は必須です。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormFields form={form} />
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
  initial: Customer;
}

function EditForm({
  open,
  initial,
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
      nameKana: initial.nameKana ?? undefined,
      customerType: initial.customerType,
      address: initial.address ?? undefined,
      phone: initial.phone ?? undefined,
      email: initial.email ?? undefined,
      contactPerson: initial.contactPerson ?? undefined,
      notes: initial.notes ?? undefined,
    },
  });

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open, setSubmitError]);

  async function onSubmit(values: UpdateFormValues): Promise<void> {
    setSubmitError(null);
    try {
      await updateCustomer(initial.id, values);
      onSaved();
    } catch (err) {
      handleApiError(err, form.setError, setSubmitError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>取引先の編集</DialogTitle>
          <DialogDescription>{initial.code} を更新します。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormFields form={form} />
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
  form: ReturnType<typeof useForm<CreateFormValues>> | ReturnType<typeof useForm<UpdateFormValues>>;
}

function FormFields({ form }: FormFieldsProps) {
  const register = form.register as ReturnType<typeof useForm<CreateFormValues>>['register'];
  const errors = form.formState.errors;

  // optional フィールドは空文字を undefined にしないと
  // Zod の .optional().email() などが「'' は不正」と弾いてしまう
  const emptyToUndef = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="c-code">取引先コード</Label>
        <Input id="c-code" {...register('code')} maxLength={50} />
        {errors.code ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.code.message as string}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-name">名称</Label>
        <Input id="c-name" {...register('name')} maxLength={200} />
        {errors.name ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.name.message as string}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-kana">名称 (カナ)</Label>
        <Input id="c-kana" {...register('nameKana', emptyToUndef)} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-type">区分</Label>
        <select
          id="c-type"
          {...register('customerType')}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {CUSTOMER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 space-y-2">
        <Label htmlFor="c-address">所在地</Label>
        <Input id="c-address" {...register('address', emptyToUndef)} maxLength={2000} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-phone">電話</Label>
        <Input id="c-phone" {...register('phone', emptyToUndef)} maxLength={50} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-email">メール</Label>
        <Input id="c-email" type="email" {...register('email', emptyToUndef)} maxLength={255} />
        {errors.email ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message as string}
          </p>
        ) : null}
      </div>

      <div className="col-span-2 space-y-2">
        <Label htmlFor="c-contact">担当者</Label>
        <Input id="c-contact" {...register('contactPerson', emptyToUndef)} maxLength={100} />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// エラーハンドリング
// --------------------------------------------------------------------

type SetFieldError = (name: 'code', err: { type: string; message: string }) => void;

function handleApiError(
  err: unknown,
  setError: SetFieldError,
  setSubmitError: (v: string | null) => void,
): void {
  if (err instanceof ApiError) {
    if (err.code === 'CUSTOMER_CODE_TAKEN') {
      setError('code', {
        type: 'server',
        message: 'この取引先コードは既に登録されています',
      });
      return;
    }
    setSubmitError(err.message);
    return;
  }
  setSubmitError('保存に失敗しました');
}
