'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { logout, me } from '@/lib/api/auth';

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const [userLabel, setUserLabel] = useState<string>('…');

  useEffect(() => {
    me()
      .then((res) => setUserLabel(`${res.user.name} (${res.user.role.name})`))
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <Link href="/admin/users" className="text-lg font-semibold">
          kouji-genka
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{userLabel}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            ログアウト
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-56 border-r bg-card p-4">
          <nav className="space-y-1 text-sm">
            <SidebarLink href="/projects">工事一覧</SidebarLink>
            <SidebarLink href="/admin/projects">工事管理</SidebarLink>
            <SidebarLink href="/admin/customers">取引先管理</SidebarLink>
            <SidebarLink href="/admin/users">ユーザ管理</SidebarLink>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}
