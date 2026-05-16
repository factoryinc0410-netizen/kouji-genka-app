'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { GrantProjectPermissionRequestSchema, type PublicUser, type RoleCode } from '@kgk/schemas';
import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { grantProjectPermission } from '@/lib/api/project-permissions';

const Schema = GrantProjectPermissionRequestSchema;
type FormValues = z.infer<typeof Schema>;

const BYPASS_ROLES: ReadonlyArray<RoleCode> = ['admin', 'accounting'];
const BYPASS_WARN = 'このロールは元々全工事の閲覧権限を持っています (UPP は実質無効)';

interface Props {
  open: boolean;
  projectId: string;
  /** 未割当ユーザのリスト (PermissionsSection 側でフィルタ済み) */
  candidates: PublicUser[];
  onOpenChange: (open: boolean) => void;
  onGranted: () => void;
}

export function GrantPermissionDialog({
  open,
  projectId,
  candidates,
  onOpenChange,
  onGranted,
}: Props): React.ReactElement {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { userId: '', canView: true, canEdit: false },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ userId: '', canView: true, canEdit: false });
      setSubmitError(null);
    }
  }, [open, form]);

  const userOptions = useMemo(
    () =>
      candidates.map((u) => ({
        value: u.id,
        label: `${u.name} — ${u.email} (${u.role.name})`,
        roleCode: u.role.code,
      })),
    [candidates],
  );

  const watchedUserId = form.watch('userId');
  const selected = userOptions.find((o) => o.value === watchedUserId);
  const selectedIsBypass = selected ? BYPASS_ROLES.includes(selected.roleCode) : false;

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    try {
      await grantProjectPermission(projectId, values);
      onGranted();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PROJECT_PERMISSION_EXISTS') {
          form.setError('userId', {
            type: 'server',
            message: 'このユーザは既に登録されています',
          });
          return;
        }
        setSubmitError(err.message);
        return;
      }
      setSubmitError('権限の付与に失敗しました');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>メンバーを追加</DialogTitle>
          <DialogDescription>ユーザを選択し、付与する権限を指定してください。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upp-user">ユーザ</Label>
            <select
              id="upp-user"
              {...form.register('userId')}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">選択してください</option>
              {userOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {form.formState.errors.userId ? (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.userId.message as string}
              </p>
            ) : null}
            {selectedIsBypass ? (
              <p
                className="text-xs text-amber-700 dark:text-amber-400"
                role="note"
                title={BYPASS_WARN}
              >
                ⚠ {BYPASS_WARN}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register('canView')}
              />
              閲覧
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register('canEdit')}
              />
              編集
            </label>
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
              {form.formState.isSubmitting ? '付与中…' : '付与'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
