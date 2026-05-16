"""
旧パッケージ SQLite データベースの読み取り専用解析スクリプト
出力: docs/legacy-data-inventory.md と docs/legacy-sqlite-schema.sql

注意: このスクリプトは絶対に DB に書き込みを行わない(read-only + immutable モード)
"""
import sqlite3
import os
import sys

DB_PATH = r"C:\Users\factory\CST\MARSNEXTDB\MN420001_marsdb.sqlite"
OUT_DIR = r"C:\Users\factory\MARSweb\docs"
INVENTORY_MD = os.path.join(OUT_DIR, "legacy-data-inventory.md")
SCHEMA_SQL = os.path.join(OUT_DIR, "legacy-sqlite-schema.sql")

os.makedirs(OUT_DIR, exist_ok=True)

# read-only + immutable で開く(誤書き込み完全防止)
uri = f"file:/{DB_PATH.replace(chr(92), '/')}?mode=ro&immutable=1"
conn = sqlite3.connect(uri, uri=True)
cur = conn.cursor()

# テーブル一覧
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]

# ビュー一覧
cur.execute("SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' ORDER BY name")
views = [r[0] for r in cur.fetchall()]

# インデックス一覧
cur.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
indexes = cur.fetchall()

# 各テーブルの行数とカラム情報
table_info = []
for t in tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM [{t}]")
        row_count = cur.fetchone()[0]
    except Exception as e:
        row_count = f"ERR({e})"
    try:
        cur.execute(f"PRAGMA table_info([{t}])")
        cols = cur.fetchall()  # (cid, name, type, notnull, dflt_value, pk)
    except Exception:
        cols = []
    table_info.append({"name": t, "rows": row_count, "cols": cols})

# CREATE TABLE 文の取得(マイグレーション参照用)
cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name")
create_stmts = cur.fetchall()

conn.close()

# テーブル名の prefix で業務領域を推定
def categorize(name: str) -> str:
    n = name.lower()
    rules = [
        ("ユーザ・権限", ["user", "role", "auth", "login", "permission"]),
        ("工事", ["kouji", "project", "koji"]),
        ("予算・内訳", ["budget", "yosan", "uchiwake", "naiyaku", "sekkei"]),
        ("代価表", ["daika", "daiyousi", "unitprice"]),
        ("単価マスタ", ["tanka", "price", "master"]),
        ("歩掛", ["buga", "bukake"]),
        ("出来高", ["dekidaka", "progress", "shinchoku"]),
        ("日報", ["nippo", "report", "daily"]),
        ("出面", ["dezura", "demen", "attendance"]),
        ("外注", ["gaichu", "subcontract"]),
        ("支払", ["shiharai", "payment"]),
        ("入金", ["nyukin", "receipt"]),
        ("請求", ["seikyu", "invoice", "billing"]),
        ("取引先", ["torihiki", "customer", "supplier", "vendor"]),
        ("労務", ["roumu", "labor", "worker"]),
        ("機械", ["kikai", "machine"]),
        ("帳票", ["chouhyou", "form", "frm"]),
        ("ログ・履歴", ["log", "history", "audit"]),
        ("システム", ["system", "config", "setting"]),
    ]
    for cat, kws in rules:
        for kw in kws:
            if kw in n:
                return cat
    return "その他"

# Markdown 生成
md = []
md.append("# 旧パッケージ SQLite データインベントリ")
md.append("")
md.append("> ⚠ このドキュメントは **kouji-genka 新システムへのデータ移行計画のための参照資料** です。")
md.append("> 新システムのスキーマ設計に旧スキーマをそのまま流用してはいけません。")
md.append("")
md.append(f"- **解析対象**: `{DB_PATH}`")
md.append(f"- **ファイルサイズ**: {os.path.getsize(DB_PATH):,} bytes")
md.append("- **アクセスモード**: 読み取り専用 (read-only + immutable)")
md.append(f"- **テーブル数**: {len(tables)}")
md.append(f"- **ビュー数**: {len(views)}")
md.append(f"- **インデックス数**: {len(indexes)}")
md.append("")
md.append("---")
md.append("")

# 業務領域別の集計
categories = {}
for ti in table_info:
    cat = categorize(ti["name"])
    categories.setdefault(cat, []).append(ti)

md.append("## 業務領域別サマリ")
md.append("")
md.append("| 領域 | テーブル数 | 総行数 |")
md.append("|---|---:|---:|")
for cat in sorted(categories.keys(), key=lambda c: -sum(t["rows"] if isinstance(t["rows"], int) else 0 for t in categories[c])):
    n_tables = len(categories[cat])
    n_rows = sum(t["rows"] if isinstance(t["rows"], int) else 0 for t in categories[cat])
    md.append(f"| {cat} | {n_tables} | {n_rows:,} |")
md.append("")

# データ規模の大きいテーブル TOP30
md.append("## データ量上位30テーブル (移行優先度判定用)")
md.append("")
md.append("| # | テーブル名 | 行数 | カラム数 | 推定領域 |")
md.append("|---:|---|---:|---:|---|")
sorted_by_rows = sorted(
    [t for t in table_info if isinstance(t["rows"], int)],
    key=lambda t: -t["rows"]
)
for i, t in enumerate(sorted_by_rows[:30], 1):
    md.append(f"| {i} | `{t['name']}` | {t['rows']:,} | {len(t['cols'])} | {categorize(t['name'])} |")
md.append("")

# 空テーブル
empty_tables = [t["name"] for t in table_info if t["rows"] == 0]
md.append(f"## 空テーブル ({len(empty_tables)}個)")
md.append("")
md.append("> 行数 0 のテーブル(未使用機能の可能性)")
md.append("")
if empty_tables:
    for i in range(0, len(empty_tables), 4):
        md.append("| " + " | ".join(f"`{n}`" for n in empty_tables[i:i+4]) + " |")
else:
    md.append("(なし)")
md.append("")

# 全テーブル一覧(領域別)
md.append("## 全テーブル一覧(業務領域別)")
md.append("")
for cat in sorted(categories.keys()):
    md.append(f"### {cat} ({len(categories[cat])}テーブル)")
    md.append("")
    md.append("| テーブル | 行数 | カラム数 | PK |")
    md.append("|---|---:|---:|---|")
    for t in sorted(categories[cat], key=lambda x: x["name"]):
        pk_cols = [c[1] for c in t["cols"] if c[5] > 0]
        pk_str = ", ".join(pk_cols) if pk_cols else "-"
        rows_str = f"{t['rows']:,}" if isinstance(t["rows"], int) else str(t["rows"])
        md.append(f"| `{t['name']}` | {rows_str} | {len(t['cols'])} | {pk_str} |")
    md.append("")

# ビュー
if views:
    md.append("## ビュー")
    md.append("")
    for v in views:
        md.append(f"- `{v}`")
    md.append("")

md.append("---")
md.append("")
md.append("## 移行作業の参考")
md.append("")
md.append("詳細な CREATE TABLE 文は [legacy-sqlite-schema.sql](./legacy-sqlite-schema.sql) を参照。")
md.append("")
md.append("移行の進め方:")
md.append("")
md.append("1. **移行優先度の判断** - 上記「データ量上位30テーブル」を起点に、新システムの対応エンティティを設計")
md.append("2. **マッピング表作成** - 旧テーブル.旧カラム → 新テーブル.新カラム の変換ルール")
md.append("3. **空テーブル除外** - 行数0のテーブルは未使用機能と判断し、新システムでも作らない方針を検討")
md.append("4. **正規化/非正規化の見直し** - 旧スキーマの判断を踏襲せず、新スキーマでは独自に最適化")
md.append("5. **金額/数量の精度確認** - SQLite は型に緩いので、数値カラムの実際の値域を別途確認")
md.append("")

with open(INVENTORY_MD, "w", encoding="utf-8") as f:
    f.write("\n".join(md))

# raw SQL スキーマ
with open(SCHEMA_SQL, "w", encoding="utf-8") as f:
    f.write("-- 旧パッケージ SQLite データベースの CREATE TABLE 文一覧\n")
    f.write("-- 移行スクリプト作成時の参照用\n")
    f.write("-- 新システムのスキーマには使用しないこと\n\n")
    for name, sql in create_stmts:
        f.write(f"-- ===== {name} =====\n")
        f.write(sql.strip() + ";\n\n")

# 標準出力にサマリ
print(f"テーブル数: {len(tables)}")
print(f"ビュー数: {len(views)}")
print(f"インデックス数: {len(indexes)}")
print(f"出力: {INVENTORY_MD}")
print(f"出力: {SCHEMA_SQL}")
