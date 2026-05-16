# kouji-genka — Claude Code プロジェクト指針

このファイルは Claude Code が本プロジェクトで開発を進める際の常駐コンテキストです。

---

## 必読ドキュメント

開発タスクを受けた際は、まず以下を参照してから着手する：

- [REQUIREMENTS.md](./REQUIREMENTS.md) — 要件定義書（全機能・データモデル・技術スタック）
- `docs/data-model.md` — DB スキーマ詳細（作成予定）
- `docs/api-spec.md` — API 仕様（作成予定）
- `docs/adr/` — アーキテクチャ決定記録（順次追加）

---

## プロジェクト概要

- **目的**：日本の建設業向け工事原価管理 Web アプリ
- **対象**：単一企業内、100ユーザ規模、オンプレ運用前提
- **方針**：既存パッケージのクリーンルーム代替（クローンではない）

---

## 技術スタック（変更時は ADR を残す）

| 領域 | 採用 |
|---|---|
| モノレポ | Turborepo + pnpm |
| フロント | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| テーブル | TanStack Table |
| サーバ状態 | TanStack Query |
| フォーム | React Hook Form + Zod |
| バック | NestJS + TypeScript |
| ORM | Prisma |
| バリデーション | Zod（フロント・バック共通スキーマ） |
| DB | PostgreSQL 16 |
| ジョブキュー | BullMQ + Redis |
| 帳票 | exceljs（Excel）、Puppeteer（PDF） |
| 認証 | NextAuth.js |
| テスト | Vitest（単体・統合）、Playwright（E2E） |
| Linter | Biome |

---

## ディレクトリ構成

```
kouji-genka/
├── apps/
│   ├── web/         # Next.js
│   └── api/         # NestJS
├── packages/
│   ├── schemas/     # Zod スキーマ（共通）
│   ├── ui/          # 共通コンポーネント
│   ├── types/       # 共通型
│   └── config/      # 共通設定
├── infra/           # Docker, nginx 等
├── docs/            # 設計ドキュメント
└── scripts/         # 運用スクリプト
```

---

## コーディング規約

### TypeScript 全般
- `any` 禁止。やむを得ない場合は `unknown` + 型ガード
- 関数の戻り型は明示
- null と undefined は混在させない（戻り値で nullable は `T | null`）
- ファイル名：`kebab-case.ts`（React コンポーネントは `PascalCase.tsx`）

### React / Next.js
- App Router 前提、Server Component をデフォルトに
- クライアント状態が必要な部分のみ `"use client"`
- データ取得は Server Component または TanStack Query
- フォームは React Hook Form + Zod
- スタイルは Tailwind、共通色は CSS 変数で定義

### NestJS
- モジュール分割：`src/modules/<domain>/`
- 1 モジュール ＝ 1 ドメイン（projects, budgets, …）
- 階層：`controller → service → repository`
- ビジネスロジックは `service` に、コントローラは薄く
- DTO は Zod スキーマから生成（`packages/schemas` 経由）
- 例外は `NestJS HttpException` ではなく独自 `DomainException` を投げ、フィルタで HTTP に変換

### Prisma
- スキーマ変更は必ずマイグレーションを生成 (`pnpm prisma migrate dev`)
- マイグレーション名は意味のある英語：`add_budget_items_table`
- 命名規則：複数形 snake_case のテーブル名、UUID v7 主キー
- 論理削除は `deleted_at` カラム（必要なテーブルのみ）
- enum は Prisma enum を優先（DB enum）

### Zod スキーマ
- フロントとバックで共通利用するため `packages/schemas` に配置
- ドメインごとにファイル分け（`project.ts`, `budget.ts` …）
- API 入出力・フォーム・Prisma DTO すべて Zod 起点

### Git / コミット
- ブランチ：`feature/<issue-id>-<short-desc>`、`fix/...`、`chore/...`
- コミットメッセージ：Conventional Commits（`feat:`, `fix:`, `refactor:`, `docs:` ...）
- PR は小さく：1機能=1PR、1000 行を超えたら分割を検討

### テスト
- 業務ロジックを持つ service には Vitest で単体テスト必須
- 主要 API には統合テスト（supertest）
- 重要な業務動線（ログイン→工事閲覧→帳票出力など）は Playwright E2E
- テストファイル：`*.test.ts`（実装ファイルと同階層）

---

## ドメイン特有の注意点

### 金額・数量の扱い
- 金額：`numeric(15,0)` 円単位、JS 側は `bigint` または文字列で取り扱う（精度ロス回避）
- 数量：`numeric(15,4)` 4桁小数、`Decimal` ライブラリ使用
- 浮動小数点演算（`number`）禁止
- 表示時は `Intl.NumberFormat('ja-JP')` で 3桁区切り

### 階層構造（内訳ツリー）
- `parent_id` + `path (ltree)` のハイブリッド構造
- ツリー走査は ltree、並び替えは `sort_order`
- 再計算は親方向に伝播（子の合計を親に積み上げ）
- 編集時は楽観ロック（`version` カラム）

### 日付・期間
- DB はすべて `timestamptz`（UTC 保存）
- 表示は JST（`Asia/Tokyo`）
- 業務上の「月次」は月初日（例：`2026-05-01`）を `date` で保持
- 日本の元号表示は使わない（西暦統一）

### 権限チェック
- API ハンドラ冒頭で必ず認可ガード
- 「ユーザが対象工事を閲覧／編集できるか」を `user_project_permissions` で判定
- 管理者は素通し、それ以外はテーブル参照

### 監査ログ
- データ更新系（POST/PATCH/DELETE）は必ず `audit_logs` に記録
- Prisma ミドルウェアで自動化を推奨
- before/after は JSON で保存

### 帳票
- すべて非同期ジョブ化（BullMQ）
- ジョブ ID を即時返却、フロントはポーリングで完了確認
- 出力結果はオブジェクトストレージに保存、署名付き URL で配布
- テンプレートは管理画面で差し替え可能に

---

## 開発の進め方

### 新機能を作るときの流れ
1. 要件を REQUIREMENTS.md で確認
2. データモデル追加が必要なら Prisma スキーマ更新 → マイグレーション
3. Zod スキーマを `packages/schemas` に追加
4. NestJS モジュール（controller / service / repository）実装
5. 単体テスト作成
6. フロント側コンポーネント実装
7. E2E テスト（主要動線のみ）
8. PR 作成

### 既存機能を変更するときの流れ
1. 関連テストを確認（落ちないか）
2. 影響範囲を Grep で特定
3. 変更
4. テスト追加・更新
5. 監査ログの取り方に影響がないか確認

---

## やってはいけないこと

### 法的・契約上
- ❌ 既存パッケージ（MARS 等）の DLL・EXE を逆コンパイル・逆アセンブルする
- ❌ 既存パッケージの画面・帳票のピクセル単位コピー
- ❌ 既存パッケージの DB スキーマをそのまま流用
- ❌ 既存パッケージのコード断片を取り込む

> 業界標準の業務概念（実行予算・内訳書・代価表・出来高など）は自由に参考にしてよい。

### 技術的
- ❌ `any` の安易な使用
- ❌ `console.log` を残してコミット（pino 等のロガーを使う）
- ❌ 環境変数を直接参照（必ず設定モジュール経由）
- ❌ DB 直 SQL（Prisma を使う、必要な場合は `$queryRaw` で型付き）
- ❌ 楽観ロックなしの編集
- ❌ N+1 クエリ
- ❌ 例外を握りつぶす（必ずログ）

### 業務的
- ❌ 金額計算で `number` を使う（精度ロス）
- ❌ 監査ログを取らないデータ変更
- ❌ 認可チェックなしの API
- ❌ パスワードの平文保存・ログ出力

---

## ローカル開発手順（実装後に整備）

```bash
# 初回
pnpm install
cp .env.example .env
docker compose up -d db redis
pnpm prisma migrate dev
pnpm db:seed

# 起動
pnpm dev   # web と api を並列起動

# テスト
pnpm test
pnpm test:e2e
```

---

## トラブル時の参照先

- 業務仕様の疑問 → REQUIREMENTS.md
- データ構造の疑問 → docs/data-model.md
- API 設計の疑問 → docs/api-spec.md
- 過去の判断 → docs/adr/

---

## このファイルの更新

- プロジェクト規約が変わったら本ファイルを更新
- 大きな技術判断は ADR を新規作成して docs/adr/ に追加
- 機能要件の変更は REQUIREMENTS.md 側に追記
