# kouji-genka (KGK)

日本の建設業向け工事原価管理 Web アプリ。

詳細は [REQUIREMENTS.md](./REQUIREMENTS.md) と [CLAUDE.md](./CLAUDE.md) を参照。

## 構成

```
kouji-genka/
├── apps/
│   ├── web/      # Next.js 15 (App Router) フロントエンド
│   └── api/      # NestJS バックエンド
├── packages/
│   ├── schemas/  # Zod 共通スキーマ (フロント・バック共用)
│   ├── types/    # 共通型定義
│   ├── ui/       # shadcn/ui 共通コンポーネント
│   └── config/   # tsconfig / biome 共通設定
├── infra/        # Docker Compose 等
├── docs/         # 設計ドキュメント
└── scripts/      # 運用スクリプト
```

## 前提

- Node.js **22 LTS**（`.nvmrc` 参照）
- pnpm **11+**（Corepack 経由を推奨）
- Docker (PostgreSQL 16 / Redis 7 をコンテナで起動)

## ローカル開発（W1〜W2 完了後に整備）

```bash
# Node を 22 に切り替え
nvm use

# pnpm を有効化（初回のみ）
corepack enable
corepack prepare pnpm@latest --activate

# 依存インストール
pnpm install

# 環境変数雛形をコピー
cp .env.example .env

# DB / Redis を起動 (W2 で追加)
# docker compose -f infra/docker-compose.yml up -d

# 開発サーバ起動 (web + api 並列)
pnpm dev
```

## スクリプト

| コマンド | 用途 |
|---|---|
| `pnpm dev` | 全アプリの開発サーバを並列起動 |
| `pnpm build` | 全アプリ・パッケージのビルド |
| `pnpm lint` | Biome で lint |
| `pnpm typecheck` | TypeScript の型チェック |
| `pnpm test` | Vitest による単体・統合テスト |
