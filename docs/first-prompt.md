# 開発サーバ初回プロンプト集

開発サーバに移行後、Claude Code に最初に投げるプロンプトのテンプレート。
コードを書く前に**理解の整合**と**環境の確認**を行うため、3段階に分ける。

---

## 前提

- 開発サーバ上に MARSweb 一式が配置済み
- Claude Code の作業ディレクトリ = プロジェクトルート(`REQUIREMENTS.md` がある場所)
- (任意) `../legacy-data/MN420001_marsdb.sqlite` に旧データ配置済み

---

## Prompt 1 — キックオフ(これを最初に投げる)

```text
新規プロジェクト「kouji-genka」(日本の建設業向け工事原価管理 Web アプリ)の開発初日です。

# 最初に読むドキュメント(以下の順で必読)

1. CLAUDE.md — プロジェクト規約・やってはいけないこと
2. REQUIREMENTS.md — 要件定義書(全16章)
3. docs/dev-server-migration-checklist.md — 開発環境の前提
4. docs/legacy-data-inventory.md — 旧データ構造(移行参照用、流用は不可)
5. docs/legacy-report-inventory.md — 旧帳票一覧(参照用)

# 開発環境の確認

以下のバージョンを確認し、結果を報告してください:
- node --version (期待: v22.x LTS)
- pnpm --version
- psql --version (期待: 16.x)
- redis-cli --version (期待: 7.x)
- docker --version
- git --version

# 最初のアウトプット(コードはまだ書かない)

読み終えたら、以下4点をテキストで返答してください。

## 1. 理解の要約(箇条書き)
- プロジェクトの目的・スコープ(Phase 区分込み)
- 採用技術スタックの要点
- 守るべき制約(法的・技術的)

## 2. 環境レポート
- 各ツールの確認結果(バージョンと可用性)
- 不足分のインストール推奨手順

## 3. Phase 1 Week 1-2 の実装計画
REQUIREMENTS.md §11.2 の「W1-2: プロジェクト初期化、CI/CD、認証基盤、ユーザ管理」を以下の粒度で提案してください:
- 作成するディレクトリ・ファイルの一覧(Turborepo + Next.js + NestJS + Prisma 構成)
- 実装順序(チケット分解、各 1〜2日で完了する粒度)
- 各チケットの完了判定基準(Definition of Done)

## 4. 疑問点・確認したいこと
- 要件・設計・前提で曖昧な点を優先度(High/Mid/Low)付きで列挙
- 私の回答が必要な選択肢があれば、選択肢として整理して提示

# 重要(安全制約)

私が上記4点を承認するまで、以下の操作は実行しないでください:
- git init などのリポジトリ初期化
- Write / Edit による任意のファイル作成・編集
- pnpm install / npm install 等のパッケージインストール
- データベース操作(CREATE DATABASE 等)
- Docker コンテナの起動

許可されている操作: Read / Grep / Glob によるドキュメント参照、--version 等の読み取り専用シェルコマンド。
```

---

## Prompt 2 — 計画承認後(初期セットアップ実行)

Prompt 1 の返答内容に問題なければ、以下を投げる。

```text
計画を承認します。Phase 1 W1 の初期セットアップを実行してください。

# 実行範囲(W1 のみ)

REQUIREMENTS.md §11.1 の「ディレクトリ構成」と §6 の「技術スタック」に従い、以下を作成:

1. リポジトリ初期化(git init、.gitignore、README.md)
2. Turborepo モノレポ初期化(pnpm-workspace.yaml、turbo.json、ルート package.json)
3. apps/web - Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui のスケルトン
4. apps/api - NestJS + TypeScript + Prisma のスケルトン
5. packages/schemas - Zod 共通スキーマパッケージ
6. packages/types - 共通型パッケージ
7. packages/config - tsconfig 共通設定
8. infra/docker-compose.yml - PostgreSQL 16 + Redis 7 のローカル開発環境
9. .env.example - 必要な環境変数の雛形
10. Biome 設定 (lint + format)
11. .github/workflows/ci.yml - lint / typecheck / test の最低限 CI

# 進め方

- 各ステップ完了ごとに簡潔に報告
- ファイル作成時は CLAUDE.md のコーディング規約を厳守
- pnpm install は最後に1回だけ実行
- 完了後に pnpm dev で apps/web と apps/api が両方起動することを確認
- 確認方法を含めて報告

# Definition of Done

- pnpm install / pnpm dev / pnpm build / pnpm lint / pnpm typecheck がエラーなく通る
- docker compose up -d db redis で DB と Redis が起動する
- README.md にローカル起動手順が記載されている

実装中に判断が必要な場面が出たら、その場で質問してください。
```

---

## Prompt 3 — W1 完了後(認証基盤・ユーザ管理)

```text
W1 のスケルトンを確認しました。W2 の「認証基盤・ユーザ管理」に進んでください。

# 実装範囲

## バックエンド (apps/api)

1. Prisma スキーマ:
   - User, Role, UserProjectPermission の3テーブル
   - REQUIREMENTS.md §7.2 のカラム定義に準拠
   - prisma migrate dev でマイグレーション作成・適用
   - prisma db seed で管理者1ユーザ + 5ロールの初期投入

2. auth モジュール:
   - パスワード認証(Argon2id)
   - セッション Cookie(HttpOnly / Secure / SameSite=Strict)
   - ログイン試行制限(10分5回でロック、Redis 利用)
   - POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/me

3. users モジュール:
   - ユーザ CRUD(管理者ロールのみ)
   - GET /api/v1/users, POST /api/v1/users, PATCH /api/v1/users/:id, DELETE /api/v1/users/:id

4. ガード:
   - 全エンドポイントで認証必須(/api/v1/auth/login を除く)
   - ロールベース認可ガード(RBAC)
   - 認可失敗は 403 で監査ログ(audit_logs)に記録

5. テスト:
   - Vitest で auth と users の単体テスト
   - supertest で API 統合テスト

## フロントエンド (apps/web)

1. NextAuth.js でログインフロー
2. /login ページ
3. /admin/users ページ(管理者用、ユーザ一覧 + 作成 + 編集ダイアログ)
4. ログアウト機能
5. 認証ミドルウェアで未ログイン時は /login にリダイレクト
6. レイアウト共通化(サイドバー、ヘッダ)、shadcn/ui のコンポーネントを利用

# 守ること

- パスワードは絶対にログ出力しない
- Zod スキーマは packages/schemas に置き、フロント・バックで共用
- 監査ログのスキーマも今のうちに用意(他モジュールから利用)
- E2E テスト(Playwright)で「ログイン → ユーザ作成 → ログアウト」の動線を1本

# 完了条件

- pnpm test がパス
- pnpm test:e2e がパス
- ブラウザで /login → /admin/users → ログアウトが動作
- 管理者以外のロールで /admin/users にアクセスすると 403
- 監査ログテーブルに認証イベントが記録される

完了したら、データモデル(ER 図相当)を docs/data-model-auth.md にまとめて提出してください。
```

---

## Prompt 運用のコツ

| 場面 | 対応 |
|---|---|
| Claude Code が大きすぎる範囲をやろうとする | 「Week 単位で区切る」と明示し、1 PR=1 Week まで |
| 設計判断が必要な場面 | ADR(`docs/adr/NNNN-title.md`)を必ず先に書かせる |
| 既存パッケージの仕様参照を求められたら | 「業界標準で考えて」と返し、旧パッケージ解析依頼は拒否 |
| バグや障害 | Prompt で「修正前に原因分析を文章化」を要求 |
| データ移行に着手するタイミング | Phase 1 完了後。それまで legacy-data には触らせない |
