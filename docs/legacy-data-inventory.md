# 旧パッケージ SQLite データインベントリ

> ⚠ このドキュメントは **kouji-genka 新システムへのデータ移行計画のための参照資料** です。
> 新システムのスキーマ設計に旧スキーマをそのまま流用してはいけません。

- **解析対象**: `C:\Users\factory\CST\MARSNEXTDB\MN420001_marsdb.sqlite`
- **ファイルサイズ**: 13,529,088 bytes
- **アクセスモード**: 読み取り専用 (read-only + immutable)
- **テーブル数**: 108
- **ビュー数**: 0
- **インデックス数**: 1

---

## 業務領域別サマリ

| 領域 | テーブル数 | 総行数 |
|---|---:|---:|
| その他 | 87 | 73,648 |
| 代価表 | 5 | 684 |
| ユーザ・権限 | 4 | 229 |
| 工事 | 1 | 11 |
| 出来高 | 1 | 10 |
| 機械 | 1 | 2 |
| 取引先 | 1 | 0 |
| 予算・内訳 | 4 | 0 |
| ログ・履歴 | 4 | 0 |

## データ量上位30テーブル (移行優先度判定用)

| # | テーブル名 | 行数 | カラム数 | 推定領域 |
|---:|---|---:|---:|---|
| 1 | `ItemsTBL` | 27,224 | 69 | その他 |
| 2 | `KoteiTBL` | 14,144 | 6 | その他 |
| 3 | `ChangeTBL` | 8,391 | 58 | その他 |
| 4 | `EditLink` | 7,996 | 9 | その他 |
| 5 | `ItemsKSTBL` | 5,011 | 12 | その他 |
| 6 | `YosoMMTBL` | 3,350 | 5 | その他 |
| 7 | `PaysTBL` | 3,079 | 27 | その他 |
| 8 | `ChangeKsTBL` | 1,050 | 14 | その他 |
| 9 | `SharePay` | 816 | 7 | その他 |
| 10 | `KPR12_AmountSumUnitPrice` | 671 | 36 | 代価表 |
| 11 | `MsgTBL` | 520 | 2 | その他 |
| 12 | `KPR14_JGISUB_ItemsTBL` | 396 | 5 | その他 |
| 13 | `HolidayTBL` | 359 | 4 | その他 |
| 14 | `Grp_Name` | 197 | 8 | その他 |
| 15 | `ConstTreeUser` | 190 | 49 | ユーザ・権限 |
| 16 | `ShareKjs` | 189 | 5 | その他 |
| 17 | `ThohyoTBL` | 189 | 10 | その他 |
| 18 | `ProgreTBL` | 137 | 7 | その他 |
| 19 | `ConstSubTBL` | 135 | 4 | その他 |
| 20 | `Grp_Name_Sub` | 82 | 11 | その他 |
| 21 | `ConstructTBL` | 64 | 27 | その他 |
| 22 | `UnitTBL` | 59 | 4 | その他 |
| 23 | `ShareDek` | 56 | 5 | その他 |
| 24 | `ItemNeme` | 44 | 10 | その他 |
| 25 | `ChangeKoteiTBL` | 43 | 7 | その他 |
| 26 | `UserAccount` | 38 | 17 | ユーザ・権限 |
| 27 | `KPR14_JGI_ItemsTBL` | 18 | 11 | その他 |
| 28 | `ShareMST` | 18 | 5 | その他 |
| 29 | `KPR16_AmountSumUnitPrice` | 13 | 36 | 代価表 |
| 30 | `KojiRoundTBL` | 11 | 8 | 工事 |

## 空テーブル (53個)

> 行数 0 のテーブル(未使用機能の可能性)

| `ChangeRatioTarget` | `CustomerInf` | `DezJTBL` | `DezJTBL_Work` |
| `DezRTBL` | `DezRTBL_Work` | `ItemRatioTarget` | `JisyaTBL` |
| `KPR10_Sort_ItemsTBL` | `KPR11_SubFt_WorkTBL` | `KPR12_DailyReportUnitPrice` | `KPR12_MergeTBL` |
| `KPR12_TargetUnitPrice` | `KPR13_Daika_ItemsTBL` | `KPR13_Meisai_ItemsTBL` | `KPR13_Uchiwake_ItemsTBL` |
| `KPR15_Sort_ItemsTBL` | `KPR15_SubFt_WorkTBL` | `KPR17_WorkItemsTBL` | `KPR20_ItemsKSFtSubTBL` |
| `KPR22_Work_ItemsTBL` | `KPR22_Work_SyukeTBL` | `KPR24_WorkYTJ` | `KPR24_WorkYTY` |
| `KPR26_Work_ItemsTBL` | `KPR26_Work_PaysTBLRuike` | `KPR26_Work_PaysTBLSyuke` | `KPR30_DGITable` |
| `KPR30_DGTable` | `KPR30_WorkProgre` | `KPR34_MAIN_XG_TBL` | `NIP03_Jisya` |
| `NIP03_Kosyu` | `NIP05_JGISUB_ItemsTBL` | `NIP05_JGI_ItemsTBL` | `NipEditLog` |
| `NipEditLogDeleteDetail` | `NipEditLogPreviousValue` | `NipProgreEditLogPreviousValue` | `PaysSubTBL` |
| `SysRoundIdx` | `SysRoundTBL` | `SysSubYosoTBL` | `TargetIndex` |
| `UsConstTreeUser` | `UsItemNeme` | `UsItemRatioTarget` | `UsKoteiTBL` |
| `UsTanClass` | `YosanEditLog` | `YosanEditLogDeleteDetail` | `YosanEditLogPreviousValue` |
| `usTanClassDetails` |

## 全テーブル一覧(業務領域別)

### その他 (87テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `AccountGroup` | 2 | 3 | Id |
| `ChangeIdx` | 7 | 13 | CI_KiId, CI_Mode, CI_CCnt |
| `ChangeKoteiTBL` | 43 | 7 | - |
| `ChangeKsTBL` | 1,050 | 14 | IK_KjId, IK_Mode, IK_CCnt, IK_UwId |
| `ChangeRatioTarget` | 0 | 6 | KjId, Mode, CCnt, ChangeId, TargetId |
| `ChangeRoundTBL` | 1 | 10 | RD_KjId, RD_Mode, RD_CCnt, RD_LineNo |
| `ChangeTBL` | 8,391 | 58 | CT_KjId, CT_Mode, CT_CCnt, CT_Id |
| `ConstSubTBL` | 135 | 4 | KS_KjId, KS_SelYM |
| `ConstructTBL` | 64 | 27 | KM_KjId |
| `DB_Version` | 1 | 2 | - |
| `DekrecTBL` | 9 | 7 | DT_KjId, DT_Date |
| `DezJTBL` | 0 | 17 | DJ_KjId, DJ_UwId, DJ_PayDate, DJ_PYLineNo, DJ_LineNo |
| `DezJTBL_Work` | 0 | 42 | DJW_KjId, DJW_Kind, DJW_Id |
| `DezRTBL` | 0 | 47 | DR_KjId, DR_UwId, DR_PayDate, DR_PYLineNo, DR_LineNo |
| `DezRTBL_Work` | 0 | 106 | DRW_KjId, DRW_Kind, DRW_Id, DRW_WorkID |
| `EditLink` | 7,996 | 9 | Sys_ID, Grp_ID, Kind, Name |
| `FutcostTBL` | 7 | 25 | FU_KjId, FU_UwId, FU_CostDate, FU_LineNo |
| `GroupLink` | 1 | 3 | UserId, GroupId |
| `Grp_Name` | 197 | 8 | DSP_NO |
| `Grp_Name_Sub` | 82 | 11 | DSP_NO |
| `HolidayTBL` | 359 | 4 | Hol_date |
| `ItemNeme` | 44 | 10 | KN_Id |
| `ItemRatioTarget` | 0 | 4 | KjId, ItemId, TargetItemId |
| `ItemsKSTBL` | 5,011 | 12 | IK_KjId, IK_UwId |
| `ItemsTBL` | 27,224 | 69 | KM_KjId, KM_Id |
| `JisyaTBL` | 0 | 10 | JS_KjId, JS_UwId, JS_PayDate, JS_LineNo |
| `KPR10_Sort_ItemsTBL` | 0 | 49 | KM_KjId, KM_Id |
| `KPR11_Sort_ItemsTBL` | 5 | 49 | KM_KjId, KM_Id |
| `KPR11_SubFt_WorkTBL` | 0 | 8 | KjId, Id |
| `KPR12_MergeTBL` | 0 | 18 | - |
| `KPR13_Meisai_ItemsTBL` | 0 | 65 | - |
| `KPR14_JGISUB_ItemsTBL` | 396 | 5 | - |
| `KPR14_JGI_ItemsTBL` | 18 | 11 | - |
| `KPR15_Sort_ItemsTBL` | 0 | 49 | KM_KjId, KM_Id |
| `KPR15_SubFt_WorkTBL` | 0 | 8 | KjId, Id |
| `KPR17_WorkItemsTBL` | 0 | 31 | KM_KjId, KM_Id |
| `KPR20_ItemsKSFtSubTBL` | 0 | 9 | KM_KjId, KM_Id, KM_Ft1, KM_SubFt |
| `KPR22_Work_ItemsTBL` | 0 | 10 | - |
| `KPR22_Work_SyukeTBL` | 0 | 19 | - |
| `KPR24_WorkYTJ` | 0 | 44 | - |
| `KPR24_WorkYTY` | 0 | 54 | - |
| `KPR26_Work_ItemsTBL` | 0 | 20 | Vno, KM_KjId, KM_Id |
| `KPR26_Work_PaysTBLRuike` | 0 | 6 | - |
| `KPR26_Work_PaysTBLSyuke` | 0 | 4 | - |
| `KPR30_DGITable` | 0 | 25 | - |
| `KPR30_DGTable` | 0 | 25 | - |
| `KPR30_WorkProgre` | 0 | 25 | - |
| `KPR34_MAIN_XD_TBL` | 1 | 35 | - |
| `KPR34_MAIN_XG_TBL` | 0 | 25 | - |
| `KoteiTBL` | 14,144 | 6 | KT_KjId, KT_UwId, KT_Kind, KT_Date |
| `MarsAccess` | 2 | 16 | Id |
| `MemberMST` | 2 | 41 | MM_Id |
| `MsgTBL` | 520 | 2 | Msg_Id |
| `NIP03_Jisya` | 0 | 10 | - |
| `NIP03_Kosyu` | 0 | 3 | - |
| `NIP05_JGISUB_ItemsTBL` | 0 | 5 | - |
| `NIP05_JGI_ItemsTBL` | 0 | 11 | - |
| `PaysSubTBL` | 0 | 8 | PS_KjId, PS_UwId, PS_PayDate |
| `PaysTBL` | 3,079 | 27 | PY_KjId, PY_UwId, PY_PayDate, PY_LineNo |
| `ProgreTBL` | 137 | 7 | PG_KjId, PG_UwId, PG_Date |
| `ReceiveTBL` | 3 | 12 | RE_KjId, RE_RecId |
| `ShareDek` | 56 | 5 | KjId |
| `ShareKjs` | 189 | 5 | KjId |
| `ShareMST` | 18 | 5 | Id |
| `SharePay` | 816 | 7 | KjId, UwId, PayDate |
| `SysCtrlTBL` | 1 | 99 | CL_Id |
| `SysHasuTBL` | 1 | 27 | HS_Id |
| `SysKmkTBL` | 9 | 5 | SU_Id |
| `SysPswdTBL` | 8 | 3 | PW_Id |
| `SysRoundIdx` | 0 | 3 | RD_Id |
| `SysRoundTBL` | 0 | 8 | RD_Id, RD_LineNo |
| `SysSubYosoTBL` | 0 | 4 | SFT_FT_Id, SFT_Id |
| `SysYosoTBL` | 10 | 9 | FT_Id |
| `TanClass` | 5 | 17 | TN_Div, TN_Id |
| `TanClassDetails` | 3 | 16 | TN_MesaiId |
| `TargetIndex` | 0 | 4 | TI_KjId, TI_Id |
| `ThohyoTBL` | 189 | 10 | KM_KjId, KM_ReportId |
| `UnitTBL` | 59 | 4 | TI_No |
| `UsConstructTBL` | 1 | 28 | UserId, KM_KjId |
| `UsItemNeme` | 0 | 11 | UserId, KN_Id |
| `UsItemRatioTarget` | 0 | 5 | UserId, KjId, ItemId, TargetItemId |
| `UsItemsKSTBL` | 1 | 13 | UserId, IK_KjId, IK_UwId |
| `UsItemsTBL` | 1 | 70 | UserId, KM_KjId, KM_Id |
| `UsKoteiTBL` | 0 | 7 | UserId, KT_KjId, KT_UwId, KT_Kind, KT_Date |
| `UsTanClass` | 0 | 18 | UserId, TN_Div, TN_Id |
| `YosoMMTBL` | 3,350 | 5 | YM_KjId, YM_CostDate, YM_Ft1 |
| `usTanClassDetails` | 0 | 17 | UserId, TN_MesaiId |

### ユーザ・権限 (4テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `ConstTreeUser` | 190 | 49 | KR_KjId |
| `ShareUser` | 1 | 6 | UserId, Id |
| `UsConstTreeUser` | 0 | 49 | UserId, KR_KjId |
| `UserAccount` | 38 | 17 | Id |

### ログ・履歴 (4テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `NipEditLog` | 0 | 8 | KjId, UwId, PayDate, PYLineNo |
| `NipEditLogDeleteDetail` | 0 | 27 | KjId, DeleteId |
| `NipEditLogPreviousValue` | 0 | 6 | KjId, UwId, PayDate, PYLineNo, ColName |
| `NipProgreEditLogPreviousValue` | 0 | 6 | KjId, UwId, PayDate |

### 予算・内訳 (4テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `KPR13_Uchiwake_ItemsTBL` | 0 | 38 | - |
| `YosanEditLog` | 0 | 5 | KjId, ItemsTBLId |
| `YosanEditLogDeleteDetail` | 0 | 36 | KjId, Id |
| `YosanEditLogPreviousValue` | 0 | 4 | KjId, ItemsTBLId, YosanEditColName |

### 代価表 (5テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `KPR12_AmountSumUnitPrice` | 671 | 36 | KM_KjId, KM_Id |
| `KPR12_DailyReportUnitPrice` | 0 | 25 | PY_KjId, PY_UwId, PY_PayDate, PY_LineNo |
| `KPR12_TargetUnitPrice` | 0 | 36 | KM_KjId, KM_Id |
| `KPR13_Daika_ItemsTBL` | 0 | 65 | - |
| `KPR16_AmountSumUnitPrice` | 13 | 36 | KM_KjId, KM_Id |

### 出来高 (1テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `KPR34_DEKIDAKA_TBL` | 10 | 27 | - |

### 取引先 (1テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `CustomerInf` | 0 | 10 | Id |

### 工事 (1テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `KojiRoundTBL` | 11 | 8 | RD_KjId, RD_LineNo |

### 機械 (1テーブル)

| テーブル | 行数 | カラム数 | PK |
|---|---:|---:|---|
| `KikaiMST` | 2 | 11 | JM_Id |

---

## 移行作業の参考

詳細な CREATE TABLE 文は [legacy-sqlite-schema.sql](./legacy-sqlite-schema.sql) を参照。

移行の進め方:

1. **移行優先度の判断** - 上記「データ量上位30テーブル」を起点に、新システムの対応エンティティを設計
2. **マッピング表作成** - 旧テーブル.旧カラム → 新テーブル.新カラム の変換ルール
3. **空テーブル除外** - 行数0のテーブルは未使用機能と判断し、新システムでも作らない方針を検討
4. **正規化/非正規化の見直し** - 旧スキーマの判断を踏襲せず、新スキーマでは独自に最適化
5. **金額/数量の精度確認** - SQLite は型に緩いので、数値カラムの実際の値域を別途確認
