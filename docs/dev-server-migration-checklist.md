# 開発サーバ移行 チェックリスト

> CST フォルダから開発サーバに何を持っていくか、何を持っていかないかの判断資料。

---

## 推奨：開発サーバに持っていくもの

### ✅ 必須

| 項目 | パス | サイズ | 理由 |
|---|---|---|---|
| **MARSweb プロジェクト一式** | `C:\Users\factory\MARSweb\` | < 100KB | 要件定義書・Claude Code 指針・解析結果 |

これだけあれば開発は開始できる。

### ⭐ 推奨(自社所有データ)

| 項目 | パス | サイズ | 理由 |
|---|---|---|---|
| **SQLite データベース** | `CST\MARSNEXTDB\MN420001_marsdb.sqlite` | 13 MB | 自社業務データ。移行スクリプトのテストデータとして必須 |

SQLite は単一ファイルで完結・OSS で読めるので、開発サーバに直接コピー可能。

### 🔍 任意(参考用)

| 項目 | パス | サイズ | 理由 |
|---|---|---|---|
| 既存帳票テンプレート | `CST\MARSEvoDATA\Frm\*.xls` | 5.4 MB | 帳票デザインの**参考画像化**用(直接流用は不可)。社内サンプル PDF があればそちらの方が好ましい |
| 設定ファイル | `CST\MARSNEXT\CFG\*.ini` | < 100 KB | 「どんな機能を社内でカスタマイズしていたか」の参考程度 |

---

## 持っていかない方がよいもの

### ❌ 持ち出し非推奨

| 項目 | パス | 理由 |
|---|---|---|
| **MARS 実行ファイル** | `CST\MARSEvo\*.exe`, `CST\MARSNEXT\*.exe` | 市販パッケージのバイナリ。開発サーバに置くと管理が煩雑、また「逆コンパイル疑い」を避けるためにも置かない |
| **MARS 各種 DLL** | `CST\MARSEvo\*.dll`, `CST\MARSNEXT\*.dll` | 同上 |
| **MARS インストーラ** | `CST\MARSEvoUpdater\*.upi`, `CST\MARSNEXT\MarsSetup.exe` | 同上 |
| **SQL Server MDF** | `CST\MARSEvoDB\MARS3DB_ME420101.mdf` | SQL Server 環境が必要。コピー自体は所有データとして可能だが、後述の「データ抽出して CSV/JSON 化」の方が運用しやすい |
| **クラウドログ** | `CST\CSTCLOUDLOG\` | 旧システムの運用ログ。開発には不要 |

---

## 解析済み・MARSweb に保存済み

以下は既に CST から解析して `MARSweb/docs/` に保存済みです。CST フォルダがなくても開発できます。

| ファイル | 内容 |
|---|---|
| [legacy-data-inventory.md](./legacy-data-inventory.md) | SQLite 108テーブルの一覧・行数・業務領域分類 |
| [legacy-sqlite-schema.sql](./legacy-sqlite-schema.sql) | 全テーブルの CREATE TABLE 文(移行スクリプト参照用) |
| [legacy-report-inventory.md](./legacy-report-inventory.md) | 旧パッケージで使っていた75種類の帳票一覧 |

---

## 推奨フォルダ構成(開発サーバ)

```
/home/dev/                           # 開発サーバ
├── projects/
│   └── kouji-genka/                 # ← MARSweb の中身をここに配置
│       ├── REQUIREMENTS.md
│       ├── CLAUDE.md
│       ├── docs/
│       │   ├── legacy-data-inventory.md
│       │   ├── legacy-sqlite-schema.sql
│       │   ├── legacy-report-inventory.md
│       │   └── dev-server-migration-checklist.md   ← 本書
│       ├── scripts/
│       │   └── analyze_sqlite.py
│       └── (今後の apps/ packages/ 等)
└── legacy-data/                     # ← 開発用テストデータ置き場(.gitignore 必須)
    ├── MN420001_marsdb.sqlite       # 自社所有データのコピー
    └── reports-samples/             # (任意)旧帳票の参考サンプル
```

> **重要**: `legacy-data/` は本番データを含む可能性があるため:
> - 必ず `.gitignore` 対象
> - 開発サーバはアクセス権限を絞る
> - 公開リポジトリにプッシュ厳禁

---

## 移行手順(コピー方法)

### Windows → 開発サーバ(Linux と想定)

#### 案 A: SCP / rsync(SSH 経由)
```bash
# 開発サーバから
rsync -avz factory@WindowsPC:'/c/Users/factory/MARSweb/' /home/dev/projects/kouji-genka/
rsync -avz factory@WindowsPC:'/c/Users/factory/CST/MARSNEXTDB/MN420001_marsdb.sqlite' /home/dev/legacy-data/
```

#### 案 B: Git 経由(MARSweb のみ)
```bash
# Windows 側で初期化
cd C:/Users/factory/MARSweb
git init
git add .
git commit -m "初期コミット: 要件定義書とドキュメント"
git remote add origin <your-internal-git>
git push -u origin main

# 開発サーバから
git clone <your-internal-git>/kouji-genka.git
```
> SQLite データは `.gitignore` で除外し、SCP で別途配置。

#### 案 C: USB / 共有フォルダ
- ファイルサイズが小さいので物理的に持ち運んでもよい(セキュリティ運用に従う)

---

## 開発サーバで最初にやること

1. **Node.js 22 LTS** インストール (`nvm install 22`)
2. **pnpm** インストール (`npm install -g pnpm`)
3. **PostgreSQL 16** インストール (Docker でも可)
4. **Redis** インストール
5. **VS Code** または **Claude Code** を起動して `/home/dev/projects/kouji-genka` を開く
6. Claude Code セッション開始時に CLAUDE.md と REQUIREMENTS.md を読み込ませる
7. Phase 1 のマイルストーン W1-2(プロジェクト初期化)から着手

---

## SQL Server MDF データの扱い(別途必要なら)

MDF はファイルだけでは開けないため、以下のいずれかで抽出する:

### 方法 1: SQL Server Management Studio (SSMS) で接続
1. 元の MARS が動作している PC で SQL Server に接続
2. `MARS3DB_ME420101` データベースを選択
3. 「タスク」→「データのエクスポート」で CSV または JSON へ
4. CSV を開発サーバへ転送

### 方法 2: sqlcmd でテーブル単位エクスポート
```cmd
sqlcmd -S localhost\SQLEXPRESS -d MARS3DB_ME420101 -Q "SELECT * FROM テーブル名" -o output.csv -s","
```

### 方法 3: MDF をデタッチして開発サーバの SQL Server にアタッチ
- 開発サーバにも SQL Server を立てる必要があるため、コスト見合いで判断

> **推奨**: 方法1または2で CSV エクスポート → 開発サーバで PostgreSQL の COPY コマンドで取り込み

---

## チェックリスト(最終確認)

開発サーバ移行前に以下を確認:

- [ ] `MARSweb/` フォルダ一式を開発サーバにコピー
- [ ] `MN420001_marsdb.sqlite` を開発サーバの `legacy-data/` に配置(任意)
- [ ] `.gitignore` で `legacy-data/` を除外
- [ ] 社内 Git リポジトリに MARSweb を push(コードレビュー・履歴管理用)
- [ ] CST フォルダ自体は元の PC に残す(旧 MARS の運用を継続するため)
- [ ] 開発サーバに Node.js / pnpm / PostgreSQL / Redis をセットアップ
- [ ] Claude Code が CLAUDE.md と REQUIREMENTS.md を参照できる状態
- [ ] (任意)社内サンプルの帳票 PDF を `legacy-data/reports-samples/` に集約
