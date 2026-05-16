import { PaginationQuerySchema } from '@kgk/schemas';

export default function HomePage(): React.ReactElement {
  const defaults = PaginationQuerySchema.parse({});
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">kouji-genka</h1>
      <p className="text-muted-foreground">工事原価管理 Web アプリ — 開発中</p>
      <p className="text-sm text-muted-foreground">
        既定ページング: page={defaults.page} / limit={defaults.limit}
      </p>
    </main>
  );
}
