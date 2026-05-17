# ADR-001 — kouji-genka を Factoryskills のアドオンとして統合する方式

- **Status**: Accepted
- **Date**: 2026-05-17
- **Deciders**: yoshino (factoryinc0410@gmail.com)
- **関連**: ADR-002 (将来の Project.department 拡張)、Phase 2 で起票予定の ADR-003 (SSO 統合)

---

## 1. コンテキスト

kouji-genka (以下 KGK) は、当初から「単一企業内・100 ユーザ規模・オンプレ運用」を前提に独立した Turborepo として開発してきた (Next.js 15 + NestJS 10 + PostgreSQL 16 + Redis 7)。一方、社内既存の業務自動化プラットフォーム **Factoryskills** (Python + FastAPI + Jinja2 + SQLite、systemd 常時稼働中、live 運用) には既に **部署別ポータル** (`管理部 / 土木部 / 建築部`) が存在しており、「土木部」配下に注文書作成、工事日報集計、代価表リンク設定などのツールが配置されている。

利用者は「KGK の機能 (実行予算編成、承認ワークフロー、予算消化率ダッシュボード) を、Factoryskills の土木部カテゴリ配下の 1 ツールとして自然に呼び出せるようにしたい」と要望している。

ただし、以下の前提条件が課されている:

- dev-app と prod-app は完全分離 (同一 VPS 上で別ディレクトリ・別 venv・別 .env)
- prod-app は systemd 常時稼働、cron 5 分監視 + 日次 backup が稼働中
- 既存の仕組みを壊さない:
  - Factoryskills 側 pytest baseline を 1 件もデグレさせない
  - KGK 側 vitest 200 件 + E2E 22 件を 1 件もデグレさせない
  - pre-commit / 環境分離 / コアロジックを最優先で守る

## 2. 検討した選択肢

### A. portal カード 1 個追加のみ (採用)
- Factoryskills 側は `web_app/routers/portal.py` の `civil_engineering.tools` に 1 dict 追加 + `admin_users.py` の `_FEATURE_CATALOG` に 1 entry 追加のみ。
- KGK は別プロセス・別 DB・別認証のまま、URL サブパス `/kgk/` で nginx リバースプロキシ経由で公開。
- 触るファイル: dev-app 側 2 ファイル / KGK 側 2 ファイル (Phase 1.5: `next.config.ts` の `basePath` 環境変数化、`playwright.config.ts` の `baseURL` 環境変数化) / サーバ側 3 ファイル (nginx config + systemd unit ×2)。

### B. portal カード追加 + navbar に「土木部」ドロップダウン
- 上に加えて `base.html` の navbar に部署ドロップダウンを追加。
- 却下理由: `base.html` のコメントで「個別スキルへの導線はポータル (/) 上の部署別カードに集約する方針」が**明文化済み**であり、これに反する。Jinja テンプレ全件の既存表示テストへの影響リスクが上乗せされる。

### C. 完全統合 (KGK の画面を Factoryskills のテンプレートに移植)
- 認証・DB・ロール・UI フレームワーク (Tailwind/shadcn ↔ Bootstrap 5) すべてを揃える事実上の全リライト。
- 却下理由: KGK の vitest 200 件と E2E 22 件が全滅する。Decimal 計算と楽観ロックの実装も Python に移植するコストが膨大。プロジェクトを差し戻すレベルの破壊的変更。

## 3. 決定

**A 案を採用する。**

具体的には以下の 4 つの判断を確定する:

| 判断 | 決定 |
|---|---|
| ナビ統合の粒度 | portal カード 1 個追加のみ。base.html / navbar は不変 |
| DB スキーマ | Phase 1 では `Project.department` を追加しない。将来案は ADR-002 で別途整理 |
| URL ルーティング | サブパス `/kgk/`。`next.config.ts` の `basePath` を `NEXT_PUBLIC_BASE_PATH` 環境変数化 (開発時 default は空文字) |
| 認証統合 | Phase 1 は別建て (利用者は Factoryskills と KGK の二重ログイン)。SSO は Phase 2 で ADR-003 を起票して検討 |

## 4. 結果として生じる変更

### Factoryskills 側 (最小侵襲、2 ファイルのみ)
- `web_app/routers/portal.py` — `civil_engineering.tools` に「工事原価管理」エントリを追加
- `web_app/routers/admin_users.py` — `_FEATURE_CATALOG` に `kouji_genka` feature を追加 (`/admin/users/{id}/permissions` 画面に自動で行が増える)

### KGK 側 (Phase 1.5 で実施、0 リスク)
- `apps/web/next.config.ts` — `basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? ''` を設定
- `apps/web/playwright.config.ts` — `baseURL` を `process.env.E2E_BASE_URL ?? 'http://localhost:3000'` で環境変数化
- `apps/web/.env.example` — 本番用 `NEXT_PUBLIC_BASE_PATH=/kgk` のコメント例を追記

### サーバ側 (Phase 2 で実 apply、Phase 1 はテンプレ整備のみ)
- `infra/systemd/kouji-genka-api.service` — 新規 (port 3001、`/opt/kouji-genka/apps/api/dist/main.js` を node で起動)
- `infra/systemd/kouji-genka-web.service` — 新規 (port 3000、`pnpm start` で起動)
- `infra/nginx/factoryskills-kgk-locations.conf` — `/kgk/` → 127.0.0.1:3000、`/kgk-api/` → 127.0.0.1:3001 のリバースプロキシ設定 (既存の Factoryskills nginx server block に include する形)
- PostgreSQL / Redis は Docker のまま `127.0.0.1` バインドで host-only

### prod-app への影響
- **Phase 1 では prod-app の systemd / nginx に一切手を入れない。** infra/ 配下のテンプレファイルをリポジトリに置くまでで止める。
- 実 apply は別フェーズで承認を取り、ステージング検証後に行う。

## 5. デグレ防止の保証

| システム | 保証手段 |
|---|---|
| Factoryskills pytest baseline | `portal.py` の DEPARTMENTS は構造変更なしのデータ追加、`admin_users.py` の `_FEATURE_CATALOG` も既存 4 entry に 1 entry 追加するのみ。tuple 構造もキー名 (`feature_name`) も既存と同一 |
| KGK vitest 200 件 | API 側 (`apps/api/`) は 1 行も触らない (`Project.department` を入れないため) |
| KGK E2E 22 件 | `basePath` 環境変数の default を空文字に固定 → 開発環境では既存挙動を完全に維持。Playwright `baseURL` も default `http://localhost:3000` を維持 |
| prod-app live 運用 | 本フェーズでは prod-app の systemd / nginx を apply しない |

## 6. 採用しなかった理由 (B / C 案)

### B 案の却下
- `base.html:31-33` で「個別スキルへの導線はポータル (/) 上の部署別カードに集約する方針。ヘッダーには「ホーム」と「管理」のみを置き、スキル増加でメニューが肥大化するのを防ぐ」と既存コードコメントで明文化されている。
- KGK 用に例外を作ると、後続スキルが追加された際に「KGK だけ navbar にあるのは何故か」という不整合が残る。
- 既存テンプレ表示テスト (Jinja レンダリング) への影響リスクが上乗せされる。

### C 案の却下
- 認証 (express-session + Argon2id → FastAPI session + bcrypt or argon2)、DB (PostgreSQL → SQLite で `numeric(15,4)` 相当の精度を担保するのは追加実装が必要)、UI (Tailwind 4 + shadcn → Bootstrap 5)、テスト (vitest + Playwright → pytest) のすべてを揃える事実上の全リライト。
- KGK 側で T13〜T35 までに積み上げた監査ログ・楽観ロック・ABAC・Decimal 計算規約が全て無効化される。
- 「既存の仕組みを壊さない」原則 (memory) に正面から違反する。

## 7. 将来への伏線

- **Phase 2 で SSO 統合を検討する場合**、Factoryskills を OIDC IdP 化するか、外部 IdP (Keycloak 等) を立てるかを ADR-003 で決定する。NextAuth.js は OIDC client モードに切り替え可能。
- **建築部での KGK 利用が始まる場合**、ADR-002 に従って `Project.department` enum を追加し、`ProjectAccessService.whereForView()` に部署フィルタを AND 合成する。

## 8. 参考

- `web_app/routers/portal.py:48-71` — 既存「土木部」dept 定義
- `web_app/routers/admin_users.py:51-74` — 既存 `_FEATURE_CATALOG`
- `web_app/templates/base.html:31-33` — 「個別スキル導線は portal に集約」方針
- `skills/kouji-genka/infra/docker-compose.yml` — KGK の PostgreSQL / Redis 構成
- `deploy_linux/factoryskills.service` — Factoryskills 既存 systemd unit
