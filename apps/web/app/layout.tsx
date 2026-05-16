import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'kouji-genka',
  description: '工事原価管理 Web アプリ',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
