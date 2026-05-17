import { redirect } from 'next/navigation';

/**
 * T35: ログイン後の初期遷移先は「管制塔ダッシュボード」。
 * /admin/dashboard で 3 メトリクス (status counts / 承認待ち / 予算カバレッジ) を表示。
 */
export default function HomePage(): never {
  redirect('/admin/dashboard');
}
