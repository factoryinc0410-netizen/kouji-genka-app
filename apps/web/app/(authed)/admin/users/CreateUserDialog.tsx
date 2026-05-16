'use client';

import { CreateUserRequestSchema, ROLE_CODES, type RoleCode } from '@kgk/schemas';
import { type FormEvent, useState } from 'react';
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
import { createUser } from '@/lib/api/users';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '管理者',
  planner: '予算編成',
  field: '現場',
  accounting: '経理',
  viewer: '閲覧',
};

export function CreateUserDialog({ open, onOpenChange, onCreated }: Props): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [roleCode, setRoleCode] = useState<RoleCode>('viewer');

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const parsed = CreateUserRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
      name: form.get('name'),
      roleCode,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力値が不正です');
      return;
    }
    setPending(true);
    try {
      await createUser(parsed.data);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '作成に失敗しました');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新規ユーザ作成</DialogTitle>
          <DialogDescription>
            メール・パスワード (12文字以上)・氏名・ロールを入力してください
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cu-email">メールアドレス</Label>
            <Input id="cu-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cu-name">氏名</Label>
            <Input id="cu-name" name="name" required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cu-password">初期パスワード</Label>
            <Input id="cu-password" name="password" type="password" required minLength={12} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cu-role">ロール</Label>
            <select
              id="cu-role"
              name="roleCode"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value as RoleCode)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              {ROLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {ROLE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '作成中…' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
