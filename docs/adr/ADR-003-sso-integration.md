# ADR-003 — Factoryskills ↔ KGK の SSO 統合 (Redis-backed One-Time Ticket)

- **Status**: Accepted (Phase 2a 実装)
- **Date**: 2026-05-17
- **Deciders**: yoshino (factoryinc0410@gmail.com)
- **関連**: ADR-001 (アドオン統合方式)、ADR-002 (将来の department 拡張)

---

## 1. コンテキスト

ADR-001 の Phase 1 で、KGK は Factoryskills の土木部ポータルにカードとして組み込まれた。しかし認証は別建てのままで、ユーザが「工事原価管理」をクリックするたびに KGK の login 画面で再ログインが必要だった。Phase 2 で UX 上のこの不便を解消するため、SSO (シングルサインオン) を実装する。

### 既存資産の把握
- **Factoryskills**: SQLite + Cookie session + CSRF token、user dict `{id, username, display_name, is_admin, permissions, role_permissions}`
- **KGK**: PostgreSQL + `express-session` + `connect-redis` (`kgk-redis:6379`) + Argon2id。`User.passwordHash` は既に `String?` (nullable) でコメントに「SSO のみのユーザは null」と明記済み (= 設計時から SSO 想定)
- **共有可能インフラ**: `kgk-redis` が `127.0.0.1:6379` で稼働中、両側からアクセス可能 (同一 VPS)

## 2. 検討した選択肢

### A. Redis-backed One-Time Ticket (採用)
ランダム UUID/token を Factoryskills が生成、Redis に payload と共に TTL 30s で保存、URL クエリで KGK に渡す。KGK は `GETDEL` で atomic に取得・削除 (one-time)、HMAC 署名で改竄検知、payload からユーザを upsert して session 確立。

### B. JWT (URL クエリ)
共有秘密鍵だけで成立し Redis 不要。ただし URL ログ/Referer リーク + replay 対策で結局 Redis blacklist が必要になる場合が多く、A 案より単純化されない。

### C. OIDC (Factoryskills を IdP 化)
`oidc-provider` を Factoryskills に組み込み、KGK を OIDC client にする。100 ユーザ規模・社内オンプレに対しては overkill。将来 IdP を社内標準として複数アプリで共有する規模に達した時の Phase 3 候補として残す。

### D. Cookie 共有 (subpath 公開時のみ)
開発が別 origin、本番でも cookie domain 設計が複雑。脆い。

## 3. 決定

**A 案を採用する。**

| 判断項目 | 決定 |
|---|---|
| SSO トランスポート | Redis-backed One-Time Ticket + HMAC-SHA256 署名 |
| Ticket TTL | 30 秒 (短命) |
| Ticket 形式 | `secrets.token_urlsafe(32)` (256-bit) |
| Replay 対策 | Redis `GETDEL` atomic (Redis 7 標準) |
| 署名検証 | 共有秘密鍵 `KGK_SSO_SHARED_SECRET` で HMAC-SHA256 |
| User 識別キー | Factoryskills の `username` → KGK の `email = {username}@sso.local` |
| Role マッピング | 下記表 4 |
| SSO 受け口 | NestJS `POST /api/v1/auth/sso/exchange` + Next.js `app/api/sso/callback/route.ts` |
| SSO 起点 | FastAPI `GET /sso/kgk/start` (`get_current_user` で認証必須) |
| ポータルからの導線 | `portal.py` の `kouji_genka` tool の URL を `/sso/kgk/start` に固定 (環境変数 default も同値) |

## 4. ロールマッピング

| Factoryskills 状態 | KGK Role | 根拠 |
|---|---|---|
| `is_admin=True` | `admin` | 全権限 |
| `kouji_genka='manager'` | `admin` | 業務マネージャは KGK 管理者扱い |
| `kouji_genka='general'` | `planner` | 業務寄り (UPP は工事単位で別途制御) |
| その他 | 拒否 (401 で KGK 画面非表示、ポータルへ戻す) | KGK 利用権限なし |

毎回 SSO 時に Factoryskills 側を**正として**上書きする (KGK 側で勝手に role が書き換わっても、次回 SSO で正しい状態に戻る)。

## 5. ユーザ upsert ルール

- **キー**: `email = {factoryskills_username}@sso.local` (合成、KGK の email 一意制約を満たす)
- **name**: Factoryskills の `display_name`
- **passwordHash**: `NULL` (SSO 専用、Argon2 ハッシュは持たない)
- **role**: 上記マッピング (毎回上書き)
- **isActive**: `True`
- **既存ユーザ**: email 一致で UPDATE。**UPP (`UserProjectPermission`) は維持** (KGK 側で別途管理)

## 6. シーケンス図

```
Browser           Factoryskills (8000)     Redis           KGK Next.js (3000)     KGK NestJS (3001)
  │ click "工事原価管理"  │                │                      │                       │
  │────────────────────>│ GET /sso/kgk/start                                              │
  │                     │ get_current_user                                                │
  │                     │ payload = {username,display_name,role,iat}                      │
  │                     │ sig = HMAC(payload, SECRET)                                     │
  │                     │ ticket = token_urlsafe(32)                                      │
  │                     │ SETEX kgk:sso:ticket:<t> 30 {payload+sig}                       │
  │                     │ ──────────────>│                                                │
  │ 302 ?ticket=<t>     │                                                                 │
  │<────────────────────│                                                                 │
  │ GET /api/sso/callback?ticket=<t>                                                      │
  │──────────────────────────────────────────────────────>│                               │
  │                                                       │ POST /auth/sso/exchange {t}  │
  │                                                       │────────────────────────────>│
  │                                                       │                              │
  │                                                       │              GETDEL kgk:sso:ticket:<t>
  │                                                       │              (atomic, one-time)
  │                                                       │              HMAC verify
  │                                                       │              user upsert
  │                                                       │              session.userId 確立
  │                                                       │              audit_log: login(SSO)
  │                                                       │ 200 + Set-Cookie kgk.sid       │
  │                                                       │<────────────────────────────│
  │ 302 /admin/dashboard + Set-Cookie                     │                              │
  │<──────────────────────────────────────────────────────│                              │
  │ KGK ダッシュボードに自動到達 (login 画面スキップ) ✅                                       │
```

## 7. セキュリティ考慮

| 攻撃面 | 対策 |
|---|---|
| Ticket 漏洩 (URL log / Referer) | TTL 30s + one-time `GETDEL`、HTTPS 強制 (本番) |
| Replay | Redis `GETDEL` で atomic 削除済み → 即 401 |
| 偽造 ticket / payload 改竄 | HMAC-SHA256 (共有秘密 32 bytes 以上) |
| KGK SSO エンドポイントへの直接攻撃 | NestJS の SSO エンドポイントは login-throttle 系の rate limit を流用、ticket なし/無効 → 即 401 |
| 権限昇格 | Factoryskills 側を毎回正として上書き。KGK で書き換えても次回 SSO で戻る |
| 監査追跡 | 両側で `audit_logs` に記録 (FS: 既存の log_admin_action、KGK: 既存の login action + entity_type=SSO で区別) |
| 鍵管理 | `.env` に置く、本番では `openssl rand -hex 32` で生成、ローテ手順を本 ADR の付録に記載 |

## 8. 実装範囲 (Phase 2a)

| Step | 内容 |
|---|---|
| 0 | 本 ADR-003 作成 |
| 1 | `.env.example` (両側) に `KGK_SSO_SHARED_SECRET` + `KGK_SSO_CALLBACK_URL` 追加 |
| 2 | Factoryskills に `redis>=5.0.0` 依存追加 + `web_app/core/redis_client.py` |
| 3 | Factoryskills に `web_app/routers/sso.py` (`GET /sso/kgk/start`) |
| 4 | KGK NestJS に `POST /api/v1/auth/sso/exchange` + user upsert + role マッピング |
| 5 | KGK Next.js に `app/api/sso/callback/route.ts` (NestJS への中継 + Set-Cookie 転送) |
| 6 | ポータルの url を `/sso/kgk/start` に変更 (環境変数 default も) |
| 7 | 両側の audit ログに SSO 痕跡を記録 |
| 8 | テスト追加 (pytest: ticket 発行、vitest: SSO exchange) |
| 9 | 検証 (lint / typecheck / test 全件) → commit → push |

## 9. Phase 2b/3 残課題

- MFA (TOTP) との整合 — KGK 側で MFA を有効化しているユーザは SSO で素通りしてよいかの判断
- 両側 logout 連動 (片方で logout → もう片方も切る)
- UPP (UserProjectPermission) を Factoryskills 側から自動マッピングする仕組み (現状は KGK 側で手動付与)
- OIDC への移行パス (Phase 3)
- 共有秘密鍵のローテーション運用 (定期的に再生成 + 両側 .env 更新 + 同時再起動)

## 10. 鍵生成手順 (運用者向け)

```bash
# 256-bit ランダム鍵を生成
openssl rand -hex 32

# 例: a1b2c3d4e5f6...  (64 文字の hex)

# 両側の .env に同じ値を設定 (必ず両方一致させる)
echo 'KGK_SSO_SHARED_SECRET=<生成した値>' >> /opt/factoryskills/.env
echo 'KGK_SSO_SHARED_SECRET=<生成した値>' >> /opt/kouji-genka/.env

# 両側を再起動
sudo systemctl restart factoryskills kouji-genka-api kouji-genka-web
```

## 11. 参考

- `apps/api/src/modules/auth/auth.service.ts` — KGK login の既存パターン (`req.session.userId` 確立)
- `apps/api/prisma/schema.prisma` — `User.passwordHash String?` ← SSO 想定済み
- `web_app/core/auth.py` — Factoryskills の `get_session_user` / `list_user_permissions`
- `web_app/routers/portal.py` — KGK アドオンの portal カード
- ADR-001 — アドオン統合の前提条件
