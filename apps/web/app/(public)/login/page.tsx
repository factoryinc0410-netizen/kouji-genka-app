'use client';

import { LoginRequestSchema } from '@kgk/schemas';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export default function LoginPage(): React.ReactElement {
  return (
    <Suspense fallback={<LoginShell pending />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/admin/users';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const parsed = LoginRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力値が不正です');
      return;
    }

    setPending(true);
    try {
      await login(parsed.data);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインに失敗しました');
      setPending(false);
    }
  }

  return <LoginShell pending={pending} error={error} onSubmit={handleSubmit} />;
}

function LoginShell({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error?: string | null;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>kouji-genka にログイン</CardTitle>
          <CardDescription>メールアドレスとパスワードを入力してください</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'ログイン中…' : 'ログイン'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
