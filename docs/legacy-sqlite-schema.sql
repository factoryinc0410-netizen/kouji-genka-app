-- 旧パッケージ SQLite データベースの CREATE TABLE 文一覧
-- 移行スクリプト作成時の参照用
-- 新システムのスキーマには使用しないこと

-- ===== AccountGroup =====
CREATE TABLE AccountGroup(
    Id INTEGER ,
    Disabled INTEGER,
    GroupName TEXT,
    PRIMARY KEY (Id)
);

-- ===== ChangeIdx =====
CREATE TABLE ChangeIdx(
    CI_KiId INTEGER,
    CI_Mode INTEGER,
    CI_CCnt INTEGER,
    CI_Date DATETIME,
    CI_Memo TEXT,
    CI_Cprice REAL,
    CI_Syoribi DATETIME,
    CI_YnKsuryoKB TEXT,
    CI_SsDate DATETIME,
    CI_SeDate DATETIME,
    CI_KokiS DATETIME,
    CI_KokiE DATETIME,
    CI_GYnKsuryoKB TEXT,
    PRIMARY KEY (CI_KiId,CI_Mode,CI_CCnt)
);

-- ===== ChangeKoteiTBL =====
CREATE TABLE ChangeKoteiTBL(
    CK_KjId INTEGER,
    CK_Mode INTEGER,
    CK_CCnt INTEGER,
    CK_UwId INTEGER,
    CK_Kind INTEGER,
    CK_Date DATETIME,
    CK_DateType INTEGER
);

-- ===== ChangeKsTBL =====
CREATE TABLE ChangeKsTBL(
    IK_KjId INTEGER,
    IK_Mode INTEGER,
    IK_CCnt INTEGER,
    IK_UwId INTEGER,
    IK_YnPrice1 REAL,
    IK_YnPrice2 REAL,
    IK_YnPrice3 REAL,
    IK_YnPrice4 REAL,
    IK_YnPrice5 REAL,
    IK_YnPrice6 REAL,
    IK_YnPrice7 REAL,
    IK_YnPrice8 REAL,
    IK_YnPrice9 REAL,
    IK_YnPrice10 REAL,
    PRIMARY KEY (IK_KjId,IK_Mode,IK_CCnt,IK_UwId)
);

-- ===== ChangeRatioTarget =====
CREATE TABLE ChangeRatioTarget (
    KjId INT NOT NULL,
    Mode INT NOT NULL,
    CCnt INT NOT NULL,
    ChangeId INT NOT NULL,
    TargetId INT NOT NULL,
    TargetType TINYINT NOT NULL,
    PRIMARY KEY (KjId, Mode, CCnt, ChangeId, TargetId)
);

-- ===== ChangeRoundTBL =====
CREATE TABLE ChangeRoundTBL(
    RD_KjId INTEGER,
    RD_Mode INTEGER,
    RD_CCnt INTEGER,
    RD_LineNo INTEGER,
    RD_TargetCol INTEGER,
    RD_TargetRow INTEGER,
    RD_TargetLevel INTEGER,
    RD_Enabled INTEGER,
    RD_Fraction INTEGER,
    RD_View INTEGER,
    PRIMARY KEY (RD_KjId,RD_Mode,RD_CCnt,RD_LineNo)
);

-- ===== ChangeTBL =====
CREATE TABLE ChangeTBL(
    CT_KjId INTEGER,
    CT_Mode INTEGER,
    CT_CCnt INTEGER,
    CT_Id INTEGER,
    CT_Name TEXT,
    CT_Name2 TEXT,
    CT_Name3 TEXT,
    CT_EditMode INTEGER,
    CT_Vno INTEGER,
    CT_Level INTEGER,
    CT_ParentId INTEGER,
    CT_Children INTEGER,
    CT_Search TEXT,
    CT_Ksuryo REAL,
    CT_Ssuryo REAL,
    CT_Nsuryo REAL,
    CT_UkeSuryo REAL,
    CT_TkSuryo REAL,
    CT_Unit TEXT,
    CT_Uprice REAL,
    CT_Price REAL,
    CT_Nprice REAL,
    CT_UkPrice REAL,
    CT_TkPrice REAL,
    CT_UkUprice REAL,
    CT_TkUprice REAL,
    CT_SsUprice REAL,
    CT_ItemType TEXT,
    CT_ItemDiv INTEGER,
    CT_ItemCode TEXT,
    CT_Dbit TEXT,
    CT_Ft1 TEXT,
    CT_Ft2 TEXT,
    CT_SubFt INTEGER,
    CT_TorihikiId INTEGER,
    CT_Torihiki TEXT,
    CT_Tekiyo TEXT,
    CT_SekoSuryo REAL,
    CT_SekoUnitcd TEXT,
    CT_SekoUnit TEXT,
    CT_SekoDays REAL,
    CT_LastUpdate DATETIME, --TEXTにしてからSTRICT付与
    CT_Dchange REAL,
    CT_Color INTEGER,
    CT_ReportName TEXT,
    CT_ReportNum INTEGER,
    CT_RepNumHnBit TEXT,
    CT_FlagPrint INTEGER,
    CT_FlagAcc INTEGER,
    CT_Expanded INTEGER,
    CT_Stat TEXT,
    CT_Attr INTEGER,
    CT_Addmode TEXT,
    CT_KjNameSv TEXT,
    CT_Counted INTEGER,
    CT_SortNo INTEGER,
    CT_ItemDetailType INTEGER,
    CT_Zpar REAL,
    PRIMARY KEY (CT_KjId,CT_Mode,CT_CCnt,CT_Id)
);

-- ===== ConstSubTBL =====
CREATE TABLE ConstSubTBL(
    KS_KjId INTEGER,
    KS_SelYM DATETIME,
    KS_MemoGen TEXT,
    KS_MemoKDai TEXT,
    PRIMARY KEY (KS_KjId,KS_SelYM)
);

-- ===== ConstTreeUser =====
CREATE TABLE ConstTreeUser(
    KR_KjId INTEGER,
    KR_TreeId TEXT,
    KR_KjCd TEXT,
    KR_Name TEXT,
    KR_Type INTEGER,
    KR_Vno INTEGER,
    KR_Level INTEGER,
    KR_ParentKjId INTEGER,
    KR_ParentTreeId TEXT,
    KR_Children INTEGER,
    KR_DeleteFlag INTEGER,
    KR_PubViewFlag INTEGER,
    KR_Acceptance INTEGER,
    KR_Kansei TEXT,
    KR_UserId INTEGER,
    KR_UserName TEXT,
    KR_GroupId INTEGER,
    KR_NyuSdate DATETIME,
    KR_Kjhdate DATETIME,
    KR_Ksdate DATETIME,
    KR_Kedate DATETIME,
    KR_Jsdate DATETIME,
    KR_Jedate DATETIME,
    KR_Ydate DATETIME,
    KR_Kandate DATETIME,
    KR_FnYear TEXT,
    KR_JyutyuKBN TEXT,
    KR_Kanmin TEXT,
    KR_KjUke TEXT,
    KR_Kjhname TEXT,
    KR_Kousyu TEXT,
    KR_KjAddP TEXT,
    KR_KjAddr TEXT,
    KR_Bumon TEXT,
    KR_Gdairi TEXT,
    KR_Free1 TEXT,
    KR_Free2 TEXT,
    KR_UkeprcT REAL,
    KR_UkeprcH REAL,
    KR_Memo TEXT,
    KR_SelYM DATETIME,
    KR_YnTtlPrice REAL,
    KR_DkRuiPrice REAL,
    KR_CmRuiPrice REAL,
    KR_Upddate DATETIME,
    KR_Status INTEGER,
    KR_Free3 TEXT,
    KR_Free4 TEXT,
    KR_CreateDateTime DATETIME,
    PRIMARY KEY (KR_KjId)
);

-- ===== ConstructTBL =====
CREATE TABLE ConstructTBL(
    KM_KjId INTEGER,
    KM_KjGuid TEXT,
    KM_Vno INTEGER,
    KM_KjName2 TEXT,
    KM_Hencnt INTEGER,
    KM_KjTanto TEXT,
    KM_EgTanto TEXT,
    KM_SgTanto TEXT,
    KM_KjSyu TEXT,
    KM_Tax REAL,
    KM_Pcprc REAL,
    KM_PassWord TEXT,
    KM_RouTanPW TEXT,
    KM_JyuTanPW TEXT,
    KM_MemoBK TEXT,
    KM_Ssdate DATETIME,
    KM_Sedate DATETIME,
    KM_NipNyuKB TEXT,
    KM_YnKsuryoKB TEXT,
    KM_Stat TEXT,
    KM_KeYear DATETIME,
    KM_KoteiKB TEXT,
    KM_KjFlag TEXT,
    KM_HasYosanSorting INTEGER,
    KM_TargetPrice REAL,
    KM_TargetRitu REAL,
    KM_GYnKsuryoKB TEXT,
    PRIMARY KEY (KM_KjId)
);

-- ===== CustomerInf =====
CREATE TABLE CustomerInf(
  Id INTEGER,
  SerialNo TEXT,
  Disabled INTEGER,
  DisabledDateTime DATETIME,
  LicenseType INTEGER,
  EnabledMars INTEGER,
  EnabledSumaho INTEGER,
  EnabledKokuban INTEGER,
  EnabledUserAdmin INTEGER,
  MaxAccount INTEGER,
  PRIMARY KEY (Id)
);

-- ===== DB_Version =====
CREATE TABLE DB_Version(
  DB_UpdateVer DATETIME,
  DB_Date DATETIME
);

-- ===== DekrecTBL =====
CREATE TABLE DekrecTBL(
  DT_KjId INTEGER,
  DT_Date DATETIME,
  DT_Kikanzen TEXT,
  DT_Kikangai TEXT,
  DT_Dekiritu REAL,
  DT_Siharai REAL,
  DT_Lastday TEXT,
  PRIMARY KEY (DT_KjId , DT_Date)
);

-- ===== DezJTBL =====
CREATE TABLE DezJTBL(
  DJ_KjId INTEGER,
  DJ_UwId INTEGER,
  DJ_PayDate DATETIME,
  DJ_PYLineNo INTEGER,
  DJ_LineNo INTEGER,
  DJ_Id INTEGER,
  DJ_Kind TEXT,
  DJ_Name TEXT,
  DJ_Ft1 TEXT,
  DJ_Ft2 TEXT,
  DJ_Vno INTEGER,
  DJ_JyuFlag TEXT,
  DJ_Unit TEXT,
  DJ_JyuUprc REAL,
  DJ_JyuTime REAL,
  DJ_JyuPrice REAL,
  DJ_Memo TEXT,
  PRIMARY KEY (DJ_KjId,DJ_UwId,DJ_PayDate,DJ_PYLineNo,DJ_LineNo)
);

-- ===== DezJTBL_Work =====
CREATE TABLE DezJTBL_Work(
  DJW_KjSort INTEGER,
  DJW_KjId INTEGER,
  DJW_KjCd TEXT,
  DJW_KjName TEXT,
  DJW_KjName2 TEXT,
  DJW_Kind TEXT,
  DJW_Id INTEGER,
  DJW_Name TEXT,
  DJW_Uprice REAL,
  DJW_Day01 REAL,
  DJW_Day02 REAL,
  DJW_Day03 REAL,
  DJW_Day04 REAL,
  DJW_Day05 REAL,
  DJW_Day06 REAL,
  DJW_Day07 REAL,
  DJW_Day08 REAL,
  DJW_Day09 REAL,
  DJW_Day10 REAL,
  DJW_Day11 REAL,
  DJW_Day12 REAL,
  DJW_Day13 REAL,
  DJW_Day14 REAL,
  DJW_Day15 REAL,
  DJW_Day16 REAL,
  DJW_Day17 REAL,
  DJW_Day18 REAL,
  DJW_Day19 REAL,
  DJW_Day20 REAL,
  DJW_Day21 REAL,
  DJW_Day22 REAL,
  DJW_Day23 REAL,
  DJW_Day24 REAL,
  DJW_Day25 REAL,
  DJW_Day26 REAL,
  DJW_Day27 REAL,
  DJW_Day28 REAL,
  DJW_Day29 REAL,
  DJW_Day30 REAL,
  DJW_Day31 REAL,
  DJW_TotalTime REAL,
  DJW_TotalPrice REAL,
  PRIMARY KEY (DJW_KjId,DJW_Kind,DJW_Id)
);

-- ===== DezRTBL =====
CREATE TABLE DezRTBL(
  DR_KjId INTEGER,
  DR_UwId INTEGER,
  DR_PayDate DATETIME,
  DR_PYLineNo INTEGER,
  DR_LineNo INTEGER,
  DR_Id INTEGER,
  DR_Kind TEXT,
  DR_Name TEXT,
  DR_Ft1 TEXT,
  DR_Ft2 TEXT,
  DR_Vno INTEGER,
  DR_NomFlag TEXT,
  DR_NomUprc REAL,
  DR_ZangUprc REAL,
  DR_SinyUprc REAL,
  DR_KyujUprc REAL,
  DR_KyusUprc REAL,
  DR_HkyuUprc REAL,
  DR_HsinUprc REAL,
  DR_NomTime REAL,
  DR_ZangTime REAL,
  DR_SinyTime REAL,
  DR_KyujTime REAL,
  DR_KyusTime REAL,
  DR_HkyuTime REAL,
  DR_HsinTime REAL,
  DR_NomPrice REAL,
  DR_ZangPrice REAL,
  DR_SinyPrice REAL,
  DR_KyujPrice REAL,
  DR_KyusPrice REAL,
  DR_HkyuPrice REAL,
  DR_HsinPrice REAL,
  DR_Free1Price REAL,
  DR_Free2Price REAL,
  DR_Free3Price REAL,
  DR_Free4Price REAL,
  DR_Free5Price REAL,
  DR_Free6Price REAL,
  DR_TTLPrice REAL,
  DR_Memo TEXT,
  DR_TimeStart DATETIME,
  DR_TimeEnd DATETIME,
  DR_RecessTime REAL,
  DR_EntId INTEGER,
  DR_StaiCnd INTEGER,
  DR_SumahoCnd INTEGER,
  PRIMARY KEY (DR_KjId,DR_UwId,DR_PayDate,DR_PYLineNo,DR_LineNo)
);

-- ===== DezRTBL_Work =====
CREATE TABLE DezRTBL_Work(
  DRW_KjSort INTEGER,
  DRW_KjId INTEGER,
  DRW_KjCd TEXT,
  DRW_KjName TEXT,
  DRW_KjName2 TEXT,
  DRW_Kind TEXT,
  DRW_Id INTEGER,
  DRW_Name TEXT,
  DRW_WorkID TEXT,
  DRW_Uprice REAL,
  DRW_Day01 REAL,
  DRW_Day02 REAL,
  DRW_Day03 REAL,
  DRW_Day04 REAL,
  DRW_Day05 REAL,
  DRW_Day06 REAL,
  DRW_Day07 REAL,
  DRW_Day08 REAL,
  DRW_Day09 REAL,
  DRW_Day10 REAL,
  DRW_Day11 REAL,
  DRW_Day12 REAL,
  DRW_Day13 REAL,
  DRW_Day14 REAL,
  DRW_Day15 REAL,
  DRW_Day16 REAL,
  DRW_Day17 REAL,
  DRW_Day18 REAL,
  DRW_Day19 REAL,
  DRW_Day20 REAL,
  DRW_Day21 REAL,
  DRW_Day22 REAL,
  DRW_Day23 REAL,
  DRW_Day24 REAL,
  DRW_Day25 REAL,
  DRW_Day26 REAL,
  DRW_Day27 REAL,
  DRW_Day28 REAL,
  DRW_Day29 REAL,
  DRW_Day30 REAL,
  DRW_Day31 REAL,
  DRW_GokeTime REAL,
  DRW_Unit TEXT,
  DRW_GokePrice REAL,
  DRW_TimeStart01 TEXT,
  DRW_TimeStart02 TEXT,
  DRW_TimeStart03 TEXT,
  DRW_TimeStart04 TEXT,
  DRW_TimeStart05 TEXT,
  DRW_TimeStart06 TEXT,
  DRW_TimeStart07 TEXT,
  DRW_TimeStart08 TEXT,
  DRW_TimeStart09 TEXT,
  DRW_TimeStart10 TEXT,
  DRW_TimeStart11 TEXT,
  DRW_TimeStart12 TEXT,
  DRW_TimeStart13 TEXT,
  DRW_TimeStart14 TEXT,
  DRW_TimeStart15 TEXT,
  DRW_TimeStart16 TEXT,
  DRW_TimeStart17 TEXT,
  DRW_TimeStart18 TEXT,
  DRW_TimeStart19 TEXT,
  DRW_TimeStart20 TEXT,
  DRW_TimeStart21 TEXT,
  DRW_TimeStart22 TEXT,
  DRW_TimeStart23 TEXT,
  DRW_TimeStart24 TEXT,
  DRW_TimeStart25 TEXT,
  DRW_TimeStart26 TEXT,
  DRW_TimeStart27 TEXT,
  DRW_TimeStart28 TEXT,
  DRW_TimeStart29 TEXT,
  DRW_TimeStart30 TEXT,
  DRW_TimeStart31 TEXT,
  DRW_TimeEnd01 TEXT,
  DRW_TimeEnd02 TEXT,
  DRW_TimeEnd03 TEXT,
  DRW_TimeEnd04 TEXT,
  DRW_TimeEnd05 TEXT,
  DRW_TimeEnd06 TEXT,
  DRW_TimeEnd07 TEXT,
  DRW_TimeEnd08 TEXT,
  DRW_TimeEnd09 TEXT,
  DRW_TimeEnd10 TEXT,
  DRW_TimeEnd11 TEXT,
  DRW_TimeEnd12 TEXT,
  DRW_TimeEnd13 TEXT,
  DRW_TimeEnd14 TEXT,
  DRW_TimeEnd15 TEXT,
  DRW_TimeEnd16 TEXT,
  DRW_TimeEnd17 TEXT,
  DRW_TimeEnd18 TEXT,
  DRW_TimeEnd19 TEXT,
  DRW_TimeEnd20 TEXT,
  DRW_TimeEnd21 TEXT,
  DRW_TimeEnd22 TEXT,
  DRW_TimeEnd23 TEXT,
  DRW_TimeEnd24 TEXT,
  DRW_TimeEnd25 TEXT,
  DRW_TimeEnd26 TEXT,
  DRW_TimeEnd27 TEXT,
  DRW_TimeEnd28 TEXT,
  DRW_TimeEnd29 TEXT,
  DRW_TimeEnd30 TEXT,
  DRW_TimeEnd31 TEXT,
  PRIMARY KEY (DRW_KjId,DRW_Kind,DRW_Id,DRW_WorkID)
);

-- ===== EditLink =====
CREATE TABLE EditLink(
  Sys_ID TEXT,
  Grp_ID TEXT,
  Kind TEXT,
  Name TEXT,
  Name_Dsp TEXT,
  Name_Memo TEXT,
  Pat_FG TEXT,
  Val_F TEXT,
  Val_T TEXT,
  PRIMARY KEY (Sys_ID,Grp_ID,Kind,Name)
);

-- ===== FutcostTBL =====
CREATE TABLE FutcostTBL(
  FU_KjId INTEGER,
  FU_UwId INTEGER,
  FU_Kind_Sel INTEGER,
  FU_UwId_Sel INTEGER,
  FU_UwId_SelKs INTEGER,
  FU_CostDate DATETIME,
  FU_LineNo INTEGER,
  FU_Name TEXT,
  FU_Name2 TEXT,
  FU_Name3 TEXT,
  FU_Vno INTEGER,
  FU_Unit TEXT,
  FU_Ft1 TEXT,
  FU_Ft2 TEXT,
  FU_TorihikiId INTEGER,
  FU_Torihiki TEXT,
  FU_YsSuryo REAL,
  FU_YsUprice REAL,
  FU_YsPrice REAL,
  FU_YsTkUprice REAL,
  FU_CmSuryo REAL,
  FU_CmPrice REAL,
  FU_YsoSuryo REAL,
  FU_YsoUprice REAL,
  FU_YsoPrice REAL,
  PRIMARY KEY (FU_KjId,FU_UwId,FU_CostDate,FU_LineNo)
);

-- ===== GroupLink =====
CREATE TABLE GroupLink(
  UserId INTEGER,
  GroupId INTEGER,
  GroupAccess INTEGER,
  PRIMARY KEY (UserId,GroupId)
);

-- ===== Grp_Name =====
CREATE TABLE Grp_Name(
  Grp_ID TEXT,
  Grp_Name TEXT,
  Kind TEXT,
  Kind_NO INTEGER,
  WSt_Name TEXT,
  DSP_Name TEXT,
  DSP_NO INTEGER,
  Def_F TEXT,
  PRIMARY KEY (DSP_NO)
);

-- ===== Grp_Name_Sub =====
CREATE TABLE Grp_Name_Sub(
  DSP_NO INTEGER,
  Wst_Name_User1 TEXT,
  Wst_Name_User2 TEXT,
  Wst_Name_User3 TEXT,
  Wst_Name_User4 TEXT,
  Wst_Name_User5 TEXT,
  Wst_Flag_User1 TEXT,
  Wst_Flag_User2 TEXT,
  Wst_Flag_User3 TEXT,
  Wst_Flag_User4 TEXT,
  Wst_Flag_User5 TEXT,
  PRIMARY KEY (DSP_NO)
);

-- ===== HolidayTBL =====
CREATE TABLE HolidayTBL(
  Hol_date DATETIME,
  Hol_Name TEXT,
  Hol_Color TEXT,
  Hol_Flg TEXT,
  PRIMARY KEY (Hol_date)
);

-- ===== ItemNeme =====
CREATE TABLE ItemNeme(
  KN_Id INTEGER,
  KN_Flg TEXT,
  KN_Name TEXT,
  KN_Vno INTEGER,
  KN_Level INTEGER,
  KN_ParentId INTEGER,
  KN_Children INTEGER,
  KN_No TEXT,
  KN_Expanded INTEGER,
  KN_Attr INTEGER,
  PRIMARY KEY (KN_Id)
);

-- ===== ItemRatioTarget =====
CREATE TABLE ItemRatioTarget (
    KjId INTEGER NOT NULL,
    ItemId INTEGER NOT NULL,
    TargetItemId INTEGER NOT NULL,
    TargetType INTEGER NOT NULL,
    PRIMARY KEY (KjId, ItemId, TargetItemId)
);

-- ===== ItemsKSTBL =====
CREATE TABLE ItemsKSTBL(
  IK_KjId INTEGER,
  IK_UwId INTEGER,
  IK_YnPrice1 REAL,
  IK_YnPrice2 REAL,
  IK_YnPrice3 REAL,
  IK_YnPrice4 REAL,
  IK_YnPrice5 REAL,
  IK_YnPrice6 REAL,
  IK_YnPrice7 REAL,
  IK_YnPrice8 REAL,
  IK_YnPrice9 REAL,
  IK_YnPrice10 REAL,
  PRIMARY KEY (IK_KjId,IK_UwId)
);

-- ===== ItemsTBL =====
CREATE TABLE ItemsTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_OnePointFlag INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_EditMode INTEGER,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Search TEXT,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Nsuryo REAL,
  KM_Uksuryo REAL,
  KM_Tksuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_Nprice REAL,
  KM_UkPrice REAL,
  KM_TkPrice REAL,
  KM_UkUprice REAL,
  KM_TkUprice REAL,
  KM_SsUprice REAL,
  KM_HketaS INTEGER,
  KM_HprocS INTEGER,
  KM_HketaT INTEGER,
  KM_HprocT INTEGER,
  KM_HketaK INTEGER,
  KM_HprocK INTEGER,
  KM_ItemType TEXT,
  KM_ItemDiv INTEGER,
  KM_ItemCode TEXT,
  KM_Zpar REAL,
  KM_Zbit1 TEXT,
  KM_Zbit2 TEXT,
  KM_Zbit3 TEXT,
  KM_Zbit4 TEXT,
  KM_Zbit5 TEXT,
  KM_Zauto TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_TorihikiId INTEGER,
  KM_Torihiki TEXT,
  KM_Tekiyo TEXT,
  KM_SekoSuryo REAL,
  KM_SekoUnitCd TEXT,
  KM_SekoUnit TEXT,
  KM_SekoDays REAL,
  KM_LastUpDate DATETIME,
  KM_Dchange REAL,
  KM_Color INTEGER,
  KM_ReportName TEXT,
  KM_ReportNum INTEGER,
  KM_RepNumHnBit TEXT,
  KM_FlagPrint INTEGER,
  KM_FlagAcc INTEGER,
  KM_Expanded INTEGER,
  KM_Stat TEXT,
  KM_Attr INTEGER,
  KM_Addmode TEXT,
  KM_KjNameSv TEXT,
  KM_Counted INTEGER,
  KM_SortNo INTEGER,
  KM_ItemDetailType INTEGER,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== JisyaTBL =====
CREATE TABLE JisyaTBL(
  JS_KjId INTEGER,
  JS_UwId INTEGER,
  JS_PayDate DATETIME,
  JS_LineNo INTEGER,
  JS_Name TEXT,
  JS_Name2 TEXT,
  JS_Unit TEXT,
  JS_Suryo REAL,
  JS_Ft1 TEXT,
  JS_Ft2 TEXT,
  PRIMARY KEY (JS_KjId,JS_UwId,JS_PayDate,JS_LineNo)
);

-- ===== KPR10_Sort_ItemsTBL =====
CREATE TABLE KPR10_Sort_ItemsTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_Dbit TEXT,
  KM_ParentId INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_TkUprice REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ReportNum INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  KM_Tekiyo TEXT,
  KM_YNPrice1 REAL,
  KM_YNPrice2 REAL,
  KM_YNPrice3 REAL,
  KM_YNPrice4 REAL,
  KM_YNPrice5 REAL,
  KM_YNPrice6 REAL,
  KM_YNPrice7 REAL,
  KM_YNPrice8 REAL,
  KM_YNPrice9 REAL,
  KM_YNPrice10 REAL,
  CT_Ssuryo REAL,
  CT_Uprice REAL,
  CT_UkUprice REAL,
  CT_TkUprice REAL,
  CT_Price REAL,
  CT_UkPrice REAL,
  CT_YNPrice1 REAL,
  CT_YNPrice2 REAL,
  CT_YNPrice3 REAL,
  CT_YNPrice4 REAL,
  CT_YNPrice5 REAL,
  CT_YNPrice6 REAL,
  CT_YNPrice7 REAL,
  CT_YNPrice8 REAL,
  CT_YNPrice9 REAL,
  CT_YNPrice10 REAL,
  CT_Tekiyo TEXT,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR11_Sort_ItemsTBL =====
CREATE TABLE KPR11_Sort_ItemsTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_Dbit TEXT,
  KM_ParentId INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_TkUprice REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ReportNum INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  KM_Tekiyo TEXT,
  KM_YNPrice1 REAL,
  KM_YNPrice2 REAL,
  KM_YNPrice3 REAL,
  KM_YNPrice4 REAL,
  KM_YNPrice5 REAL,
  KM_YNPrice6 REAL,
  KM_YNPrice7 REAL,
  KM_YNPrice8 REAL,
  KM_YNPrice9 REAL,
  KM_YNPrice10 REAL,
  CT_Ssuryo REAL,
  CT_Uprice REAL,
  CT_UkUprice REAL,
  CT_TkUprice REAL,
  CT_Price REAL,
  CT_UkPrice REAL,
  CT_YNPrice1 REAL,
  CT_YNPrice2 REAL,
  CT_YNPrice3 REAL,
  CT_YNPrice4 REAL,
  CT_YNPrice5 REAL,
  CT_YNPrice6 REAL,
  CT_YNPrice7 REAL,
  CT_YNPrice8 REAL,
  CT_YNPrice9 REAL,
  CT_YNPrice10 REAL,
  CT_Tekiyo TEXT,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR11_SubFt_WorkTBL =====
CREATE TABLE KPR11_SubFt_WorkTBL(
  KjId INTEGER,
  Id INTEGER,
  ParentId INTEGER,
  Yoso INTEGER,
  Ft1 TEXT,
  SubFt INTEGER,
  Price1 REAL,
  Price2 REAL,
  PRIMARY KEY (KjId,Id)
);

-- ===== KPR12_AmountSumUnitPrice =====
CREATE TABLE KPR12_AmountSumUnitPrice(
  Vno INTEGER,
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkSuryo REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_TkSuryo REAL,
  KM_TkUprice REAL,
  KM_TkPrice REAL,
  KM_ItemType TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_Torihiki TEXT,
  KM_Stat TEXT,
  KM_Addmode TEXT,
  KM_KsId REAL,
  KM_PSuryo REAL,
  KM_DekiSuryo REAL,
  KM_ScheduleDays INTEGER,
  KM_ResultDays INTEGER,
  KM_DaysZen INTEGER,
  KM_DaysTarget INTEGER,
  KM_TargetRitu REAL,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR12_DailyReportUnitPrice =====
CREATE TABLE KPR12_DailyReportUnitPrice(
  PY_KjId INTEGER,
  PY_UwId INTEGER,
  PY_PayDate DATETIME,
  PY_LineNo INTEGER,
  PY_Name TEXT,
  PY_Name2 TEXT,
  PY_Name3 TEXT,
  PY_Vno INTEGER,
  PY_Kind_Sel INTEGER,
  PY_UwId_Sel INTEGER,
  PY_UwId_SelKs INTEGER,
  PY_Suryo REAL,
  PY_Unit TEXT,
  PY_Uprice REAL,
  PY_Price REAL,
  PY_PriceTax REAL,
  PY_Ft1 TEXT,
  PY_Ft2 TEXT,
  PY_SubFt INTEGER,
  PY_TorihikiId INTEGER,
  PY_Torihiki TEXT,
  PY_Tekiyo TEXT,
  PY_FlagAcc INTEGER,
  PY_YUprice REAL,
  PY_Keiyaku TEXT,
  PRIMARY KEY (PY_KjId,PY_UwId,PY_PayDate,PY_LineNo)
);

-- ===== KPR12_MergeTBL =====
CREATE TABLE KPR12_MergeTBL(
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_ParentId INTEGER,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkSuryo REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_TkSuryo REAL,
  KM_TkUprice REAL,
  KM_TkPrice REAL,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_Torihiki TEXT,
  Jsuryo REAL
);

-- ===== KPR12_TargetUnitPrice =====
CREATE TABLE KPR12_TargetUnitPrice(
  Vno INTEGER,
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkSuryo REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_TkSuryo REAL,
  KM_TkUprice REAL,
  KM_TkPrice REAL,
  KM_ItemType TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_Torihiki TEXT,
  KM_Stat TEXT,
  KM_Addmode TEXT,
  KM_KsId REAL,
  KM_PSuryo REAL,
  KM_DekiSuryo REAL,
  KM_ScheduleDays INTEGER,
  KM_ResultDays INTEGER,
  KM_DaysZen INTEGER,
  KM_DaysTarget INTEGER,
  KM_TargetRitu REAL,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR13_Daika_ItemsTBL =====
CREATE TABLE KPR13_Daika_ItemsTBL(
  KName TEXT,
  KName2 TEXT,
  KjSuryo REAL,
  KjSuryo_H REAL,
  KjUnit TEXT,
  KjUprice REAL,
  KjUprice_H REAL,
  KjPrice REAL,
  KjPrice_H REAL,
  KjSekkeiSuryo REAL,
  KjSekkeiSuryo_H REAL,
  KjSekkeiUnit TEXT,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_Name4 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Ssuryo_H REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Uprice_H REAL,
  KM_Price REAL,
  KM_Price_H REAL,
  KM_Ritu REAL,
  KM_ReportName TEXT,
  KM_ReportNum INTEGER,
  KM_RepNumHnBit TEXT,
  Ksuryo REAL,
  Ssuryo REAL,
  Unit TEXT,
  Uprice REAL,
  Price REAL,
  Ritu REAL,
  GrovalVno INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  HenBit INTEGER,
  KamokuName TEXT,
  KM_AddMode TEXT,
  KM_FlagPrint INTEGER,
  KeisanDiv INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ItemDiv INTEGER,
  KM_ItemType TEXT,
  KM_Tekiyo TEXT,
  KjUkUprice REAL,
  KjUkUprice_H REAL,
  KjTkUprice REAL,
  KjTkUPrice_H REAL,
  KjTkPrice REAL,
  KjTkPrice_H REAL,
  KM_UkUprice REAL,
  KM_UkUprice_H REAL,
  KM_TkUPrice REAL,
  KM_TkUprice_H REAL,
  KM_TkPrice REAL,
  KM_TkPrice_H REAL
);

-- ===== KPR13_Meisai_ItemsTBL =====
CREATE TABLE KPR13_Meisai_ItemsTBL(
  KName TEXT,
  KName2 TEXT,
  KjSuryo REAL,
  KjSuryo_H REAL,
  KjUnit TEXT,
  KjUprice REAL,
  KjUprice_H REAL,
  KjPrice REAL,
  KjPrice_H REAL,
  KjSekkeiSuryo REAL,
  KjSekkeiSuryo_H REAL,
  KjSekkeiUnit TEXT,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_Name4 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Ssuryo_H REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Uprice_H REAL,
  KM_Price REAL,
  KM_Price_H REAL,
  KM_Ritu REAL,
  KM_ReportName TEXT,
  KM_ReportNum INTEGER,
  KM_RepNumHnBit TEXT,
  Ksuryo REAL,
  Ssuryo REAL,
  Unit TEXT,
  Uprice REAL,
  Price REAL,
  Ritu REAL,
  GrovalVno INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  HenBit INTEGER,
  KamokuName TEXT,
  KM_AddMode TEXT,
  KM_FlagPrint INTEGER,
  KeisanDiv INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ItemDiv INTEGER,
  KM_ItemType TEXT,
  KM_Tekiyo TEXT,
  KjUkUprice REAL,
  KjUkUprice_H REAL,
  KjTkUprice REAL,
  KjTkUPrice_H REAL,
  KjTkPrice REAL,
  KjTkPrice_H REAL,
  KM_UkUprice REAL,
  KM_UkUprice_H REAL,
  KM_TkUPrice REAL,
  KM_TkUprice_H REAL,
  KM_TkPrice REAL,
  KM_TkPrice_H REAL
);

-- ===== KPR13_Uchiwake_ItemsTBL =====
CREATE TABLE KPR13_Uchiwake_ItemsTBL(
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_Name4 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_Ritu REAL,
  KM_ReportName TEXT,
  KM_ReportNum INTEGER,
  KM_RepNumHnBit TEXT,
  Ksuryo REAL,
  Ssuryo REAL,
  Unit TEXT,
  Uprice REAL,
  Price REAL,
  Ritu REAL,
  GrovalVno INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  HenBit INTEGER,
  KamokuName TEXT,
  KM_AddMode TEXT,
  KM_FlagPrint INTEGER,
  KeisanDiv INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ItemDiv INTEGER,
  KM_ItemType TEXT,
  KM_Tekiyo TEXT
);

-- ===== KPR14_JGISUB_ItemsTBL =====
CREATE TABLE KPR14_JGISUB_ItemsTBL(
  KM_Name TEXT,
  KM_Price REAL,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT
);

-- ===== KPR14_JGI_ItemsTBL =====
CREATE TABLE KPR14_JGI_ItemsTBL(
  KM_Name TEXT,
  KM_YNPrice1 REAL,
  KM_YNPrice2 REAL,
  KM_YNPrice3 REAL,
  KM_YNPrice4 REAL,
  KM_YNPrice5 REAL,
  KM_YNPrice6 REAL,
  KM_YNPrice7 REAL,
  KM_YNPrice8 REAL,
  KM_YNPrice9 REAL,
  KM_YNPrice10 REAL
);

-- ===== KPR15_Sort_ItemsTBL =====
CREATE TABLE KPR15_Sort_ItemsTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_Dbit TEXT,
  KM_ParentId INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_TkUprice REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ReportNum INTEGER,
  NextRepName TEXT,
  NextRepNum INTEGER,
  KM_Tekiyo TEXT,
  KM_YNPrice1 REAL,
  KM_YNPrice2 REAL,
  KM_YNPrice3 REAL,
  KM_YNPrice4 REAL,
  KM_YNPrice5 REAL,
  KM_YNPrice6 REAL,
  KM_YNPrice7 REAL,
  KM_YNPrice8 REAL,
  KM_YNPrice9 REAL,
  KM_YNPrice10 REAL,
  CT_Ssuryo REAL,
  CT_Uprice REAL,
  CT_UkUprice REAL,
  CT_TkUprice REAL,
  CT_Price REAL,
  CT_UkPrice REAL,
  CT_YNPrice1 REAL,
  CT_YNPrice2 REAL,
  CT_YNPrice3 REAL,
  CT_YNPrice4 REAL,
  CT_YNPrice5 REAL,
  CT_YNPrice6 REAL,
  CT_YNPrice7 REAL,
  CT_YNPrice8 REAL,
  CT_YNPrice9 REAL,
  CT_YNPrice10 REAL,
  CT_Tekiyo TEXT,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR15_SubFt_WorkTBL =====
CREATE TABLE KPR15_SubFt_WorkTBL(
  KjId INTEGER,
  Id INTEGER,
  ParentId INTEGER,
  Yoso INTEGER,
  Ft1 TEXT,
  SubFt INTEGER,
  Price1 REAL,
  Price2 REAL,
  PRIMARY KEY (KjId,Id)
);

-- ===== KPR16_AmountSumUnitPrice =====
CREATE TABLE KPR16_AmountSumUnitPrice(
  Vno INTEGER,
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkSuryo REAL,
  KM_UkUprice REAL,
  KM_UkPrice REAL,
  KM_TkSuryo REAL,
  KM_TkUprice REAL,
  KM_TkPrice REAL,
  KM_ItemType TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_Torihiki TEXT,
  KM_Stat TEXT,
  KM_Addmode TEXT,
  KM_KsId REAL,
  KM_PSuryo REAL,
  KM_DekiSuryo REAL,
  KM_ScheduleDays INTEGER,
  KM_ResultDays INTEGER,
  KM_DaysZen INTEGER,
  KM_DaysTarget INTEGER,
  KM_TargetRitu REAL,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR17_WorkItemsTBL =====
CREATE TABLE KPR17_WorkItemsTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_KamokuId INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_Dbit TEXT,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_UkUprice REAL,
  KM_TkUprice REAL,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_ItemType TEXT,
  KM_YnPrice1 REAL,
  KM_YnPrice2 REAL,
  KM_YnPrice3 REAL,
  KM_YnPrice4 REAL,
  KM_YnPrice5 REAL,
  KM_YnPrice6 REAL,
  KM_YnPrice7 REAL,
  KM_YnPrice8 REAL,
  KM_YnPrice9 REAL,
  KM_YnPrice10 REAL,
  PRIMARY KEY (KM_KjId,KM_Id)
);

-- ===== KPR20_ItemsKSFtSubTBL =====
CREATE TABLE KPR20_ItemsKSFtSubTBL(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Ft1 TEXT,
  KM_Ft1_Name TEXT,
  KM_SubFt INTEGER,
  KM_SubFt_Name TEXT,
  KM_YnPrice REAL,
  PRIMARY KEY (KM_KjId,KM_Id,KM_Ft1,KM_SubFt)
);

-- ===== KPR22_Work_ItemsTBL =====
CREATE TABLE KPR22_Work_ItemsTBL(
  WK_KjId INTEGER,
  WK_ParentId INTEGER,
  WK_Ft1 TEXT,
  WK_Ft2 TEXT,
  WK_Name TEXT,
  WK_Name2 TEXT,
  WK_Name3 TEXT,
  WK_Unit TEXT,
  WK_Suryo REAL,
  WK_Price REAL
);

-- ===== KPR22_Work_SyukeTBL =====
CREATE TABLE KPR22_Work_SyukeTBL(
  WK_KjId INTEGER,
  WK_Ft1 TEXT,
  WK_Ft2 TEXT,
  WK_Name TEXT,
  WK_Name2 TEXT,
  WK_Name3 TEXT,
  WK_Unit TEXT,
  WK_CndYN INTEGER,
  WK_CndPY INTEGER,
  WK_CndPYRui INTEGER,
  WK_CndFU INTEGER,
  WK_YnSuryo REAL,
  WK_YnPrice REAL,
  WK_PySuryo REAL,
  WK_PyPrice REAL,
  WK_PyRuiSuryo REAL,
  WK_PyRuiPrice REAL,
  WK_FuSuryo REAL,
  WK_FuPrice REAL
);

-- ===== KPR24_WorkYTJ =====
CREATE TABLE KPR24_WorkYTJ(
  KjId INTEGER,
  Id INTEGER,
  Name TEXT,
  Name2 TEXT,
  ParentID INTEGER,
  Children INTEGER,
  Dbit INTEGER,
  Vno INTEGER,
  Level INTEGER,
  Unit TEXT,
  Suryo REAL,
  Uprice REAL,
  Price REAL,
  Ksuryo REAL,
  YnPrice1 REAL,
  YnPrice2 REAL,
  YnPrice3 REAL,
  YnPrice4 REAL,
  YnPrice5 REAL,
  YnPrice6 REAL,
  YnPrice7 REAL,
  YnPrice8 REAL,
  YnPrice9 REAL,
  YnPrice10 REAL,
  MonPrice1 REAL,
  MonPrice2 REAL,
  MonPrice3 REAL,
  MonPrice4 REAL,
  MonPrice5 REAL,
  MonPrice6 REAL,
  MonPrice7 REAL,
  MonPrice8 REAL,
  MonPrice9 REAL,
  MonPrice10 REAL,
  TotalPrice1 REAL,
  TotalPrice2 REAL,
  TotalPrice3 REAL,
  TotalPrice4 REAL,
  TotalPrice5 REAL,
  TotalPrice6 REAL,
  TotalPrice7 REAL,
  TotalPrice8 REAL,
  TotalPrice9 REAL,
  TotalPrice10 REAL
);

-- ===== KPR24_WorkYTY =====
CREATE TABLE KPR24_WorkYTY(
  KjId INTEGER,
  Id INTEGER,
  Name TEXT,
  Name2 TEXT,
  ParentID INTEGER,
  Children INTEGER,
  Dbit INTEGER,
  Vno INTEGER,
  Level INTEGER,
  Unit TEXT,
  Suryo REAL,
  Uprice REAL,
  Price REAL,
  Ksuryo REAL,
  YnPrice1 REAL,
  YnPrice2 REAL,
  YnPrice3 REAL,
  YnPrice4 REAL,
  YnPrice5 REAL,
  YnPrice6 REAL,
  YnPrice7 REAL,
  YnPrice8 REAL,
  YnPrice9 REAL,
  YnPrice10 REAL,
  MonPrice1 REAL,
  MonPrice2 REAL,
  MonPrice3 REAL,
  MonPrice4 REAL,
  MonPrice5 REAL,
  MonPrice6 REAL,
  MonPrice7 REAL,
  MonPrice8 REAL,
  MonPrice9 REAL,
  MonPrice10 REAL,
  TotalPrice1 REAL,
  TotalPrice2 REAL,
  TotalPrice3 REAL,
  TotalPrice4 REAL,
  TotalPrice5 REAL,
  TotalPrice6 REAL,
  TotalPrice7 REAL,
  TotalPrice8 REAL,
  TotalPrice9 REAL,
  TotalPrice10 REAL,
  YsPrice1 REAL,
  YsPrice2 REAL,
  YsPrice3 REAL,
  YsPrice4 REAL,
  YsPrice5 REAL,
  YsPrice6 REAL,
  YsPrice7 REAL,
  YsPrice8 REAL,
  YsPrice9 REAL,
  YsPrice10 REAL
);

-- ===== KPR26_Work_ItemsTBL =====
CREATE TABLE KPR26_Work_ItemsTBL(
  Vno INTEGER,
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_KamokuId INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ssuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_ItemType TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Torihiki TEXT,
  KM_Stat TEXT,
  KM_Addmode TEXT,
  PRIMARY KEY (Vno,KM_KjId,KM_Id)
);

-- ===== KPR26_Work_PaysTBLRuike =====
CREATE TABLE KPR26_Work_PaysTBLRuike(
  Vno INTEGER,
  PY_KjId INTEGER,
  PY_UwId INTEGER,
  PY_YM DATETIME,
  PY_Price REAL,
  Zero INTEGER
);

-- ===== KPR26_Work_PaysTBLSyuke =====
CREATE TABLE KPR26_Work_PaysTBLSyuke(
  PY_KjId INTEGER,
  PY_UwId INTEGER,
  PY_YM DATETIME,
  PY_Price REAL
);

-- ===== KPR30_DGITable =====
CREATE TABLE KPR30_DGITable(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_KamokuId INTEGER,
  KM_SateiKubun INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Level INTEGER,
  KM_Children INTEGER,
  KM_Dbit TEXT,
  KM_ParentID INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_ItemType TEXT,
  KM_Vno INTEGER,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Price REAL,
  KM_ParcentUP REAL,
  KM_DPriceUP REAL,
  KM_DSuryoUP REAL,
  KM_ParcentDown REAL,
  KM_DPriceDown REAL,
  KM_DSuryoDown REAL,
  KM_ParcentFlag INTEGER,
  KM_SortNo INTEGER
);

-- ===== KPR30_DGTable =====
CREATE TABLE KPR30_DGTable(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_KamokuId INTEGER,
  KM_SateiKubun INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Level INTEGER,
  KM_Children INTEGER,
  KM_Dbit TEXT,
  KM_ParentID INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_ItemType TEXT,
  KM_Vno INTEGER,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Price REAL,
  KM_ParcentUP REAL,
  KM_DPriceUP REAL,
  KM_DSuryoUP REAL,
  KM_ParcentDown REAL,
  KM_DPriceDown REAL,
  KM_DSuryoDown REAL,
  KM_ParcentFlag INTEGER,
  KM_SortNo INTEGER
);

-- ===== KPR30_WorkProgre =====
CREATE TABLE KPR30_WorkProgre(
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_KamokuId INTEGER,
  KM_SateiKubun INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Level INTEGER,
  KM_Children INTEGER,
  KM_Dbit TEXT,
  KM_ParentID INTEGER,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_ItemType TEXT,
  KM_Vno INTEGER,
  KM_Unit TEXT,
  KM_Ssuryo REAL,
  KM_Price REAL,
  KM_ParcentUP REAL,
  KM_DPriceUP REAL,
  KM_DSuryoUP REAL,
  KM_ParcentDown REAL,
  KM_DPriceDown REAL,
  KM_DSuryoDown REAL,
  KM_ParcentFlag INTEGER,
  KM_SortNo INTEGER
);

-- ===== KPR34_DEKIDAKA_TBL =====
CREATE TABLE KPR34_DEKIDAKA_TBL(
  KamokuId INTEGER,
  UwId INTEGER,
  Unit TEXT,
  Vno INTEGER,
  Level INTEGER,
  Name TEXT,
  Name2 TEXT,
  ParentID INTEGER,
  Dbit TEXT,
  Suryo REAL,
  Uprice REAL,
  Price REAL,
  DekiSuryo1 REAL,
  DekiRitu1 REAL,
  DekiPrice1 REAL,
  DekiSuryo2 REAL,
  DekiRitu2 REAL,
  DekiPrice2 REAL,
  DekiSuryo3 REAL,
  DekiRitu3 REAL,
  DekiPrice3 REAL,
  DekiSuryo4 REAL,
  DekiRitu4 REAL,
  DekiPrice4 REAL,
  DekiSuryo5 REAL,
  DekiRitu5 REAL,
  DekiPrice5 REAL
);

-- ===== KPR34_MAIN_XD_TBL =====
CREATE TABLE KPR34_MAIN_XD_TBL(
  RuiDekiPrice1 REAL,
  RuiDekiRitu1 REAL,
  KonDekiPrice1 REAL,
  KonDekiRitu1 REAL,
  YoteiDekiPrice1 REAL,
  YoteiDekiRitu1 REAL,
  Kikan1 TEXT,
  RuiDekiPrice2 REAL,
  RuiDekiRitu2 REAL,
  KonDekiPrice2 REAL,
  KonDekiRitu2 REAL,
  YoteiDekiPrice2 REAL,
  YoteiDekiRitu2 REAL,
  Kikan2 TEXT,
  RuiDekiPrice3 REAL,
  RuiDekiRitu3 REAL,
  KonDekiPrice3 REAL,
  KonDekiRitu3 REAL,
  YoteiDekiPrice3 REAL,
  YoteiDekiRitu3 REAL,
  Kikan3 TEXT,
  RuiDekiPrice4 REAL,
  RuiDekiRitu4 REAL,
  KonDekiPrice4 REAL,
  KonDekiRitu4 REAL,
  YoteiDekiPrice4 REAL,
  YoteiDekiRitu4 REAL,
  Kikan4 TEXT,
  RuiDekiPrice5 REAL,
  RuiDekiRitu5 REAL,
  KonDekiPrice5 REAL,
  KonDekiRitu5 REAL,
  YoteiDekiPrice5 REAL,
  YoteiDekiRitu5 REAL,
  Kikan5 TEXT
);

-- ===== KPR34_MAIN_XG_TBL =====
CREATE TABLE KPR34_MAIN_XG_TBL(
  RuiDekiRitu1 REAL,
  SateiRitu1 REAL,
  ZenSiharaiPrice1 REAL,
  XG_KonSateiPrice1 REAL,
  Kikan1 TEXT,
  RuiDekiRitu2 REAL,
  SateiRitu2 REAL,
  ZenSiharaiPrice2 REAL,
  XG_KonSateiPrice2 REAL,
  Kikan2 TEXT,
  RuiDekiRitu3 REAL,
  SateiRitu3 REAL,
  ZenSiharaiPrice3 REAL,
  XG_KonSateiPrice3 REAL,
  Kikan3 TEXT,
  RuiDekiRitu4 REAL,
  SateiRitu4 REAL,
  ZenSiharaiPrice4 REAL,
  XG_KonSateiPrice4 REAL,
  Kikan4 TEXT,
  RuiDekiRitu5 REAL,
  SateiRitu5 REAL,
  ZenSiharaiPrice5 REAL,
  XG_KonSateiPrice5 REAL,
  Kikan5 TEXT
);

-- ===== KikaiMST =====
CREATE TABLE KikaiMST(
  JM_Id INTEGER,
  JM_Kind TEXT,
  JM_Name TEXT,
  JM_Vno INTEGER,
  JM_JyuFlag TEXT,
  JM_DateF DATETIME,
  JM_JyuUprc REAL,
  JM_JyuUprcK REAL,
  JM_JyuUprc_B REAL,
  JM_JyuUprcK_B REAL,
  JM_Memo TEXT,
  PRIMARY KEY (JM_Id)
);

-- ===== KojiRoundTBL =====
CREATE TABLE KojiRoundTBL(
  RD_KjId INTEGER,
  RD_LineNo INTEGER,
  RD_TargetCol INTEGER,
  RD_TargetRow INTEGER,
  RD_TargetLevel INTEGER,
  RD_Enabled INTEGER,
  RD_Fraction INTEGER,
  RD_View INTEGER,
  PRIMARY KEY (RD_KjId,RD_LineNo)
);

-- ===== KoteiTBL =====
CREATE TABLE KoteiTBL(
  KT_KjId INTEGER,
  KT_UwId INTEGER,
  KT_Kind INTEGER,
  KT_Date DATETIME,
  KT_OnePointFlag INTEGER,
  KT_DateType INTEGER,
  PRIMARY KEY (KT_KjId,KT_UwId,KT_Kind,KT_Date)
);

-- ===== MarsAccess =====
CREATE TABLE MarsAccess(
  Id INTEGER,
  Disabled INTEGER,
  Type INTEGER,
  AccName TEXT,
  Vno INTEGER,
  AccInit INTEGER,
  AccRoumu INTEGER,
  AccKikai INTEGER,
  AccBuga INTEGER,
  AccMaster INTEGER,
  AccPrtMisei INTEGER,
  AccPrtTori INTEGER,
  AccPrtKjKei INTEGER,
  AccPrtZen INTEGER,
  AccPayZen INTEGER,
  AccKjZen INTEGER,
  PRIMARY KEY (Id)
);

-- ===== MemberMST =====
CREATE TABLE MemberMST(
  MM_Id INTEGER,
  MM_Kind TEXT,
  MM_Name TEXT,
  MM_Vno INTEGER,
  MM_NomFlag TEXT,
  MM_DateF DATETIME,
  MM_NomUprc REAL,
  MM_ZangUprc REAL,
  MM_SinyUprc REAL,
  MM_KyujUprc REAL,
  MM_KyusUprc REAL,
  MM_HkyuUprc REAL,
  MM_HsinUprc REAL,
  MM_NomUprcK REAL,
  MM_ZangUprcK REAL,
  MM_SinyUprcK REAL,
  MM_KyujUprcK REAL,
  MM_KyusUprcK REAL,
  MM_HkyuUprcK REAL,
  MM_HsinUprcK REAL,
  MM_Free1Price REAL,
  MM_Free2Price REAL,
  MM_Free3Price REAL,
  MM_Free4Price REAL,
  MM_Free5Price REAL,
  MM_Free6Price REAL,
  MM_NomUprc_B REAL,
  MM_ZangUprc_B REAL,
  MM_SinyUprc_B REAL,
  MM_KyujUprc_B REAL,
  MM_KyusUprc_B REAL,
  MM_HkyuUprc_B REAL,
  MM_HsinUprc_B REAL,
  MM_NomUprcK_B REAL,
  MM_ZangUprcK_B REAL,
  MM_SinyUprcK_B REAL,
  MM_KyujUprcK_B REAL,
  MM_KyusUprcK_B REAL,
  MM_HkyuUprcK_B REAL,
  MM_HsinUprcK_B REAL,
  MM_Memo TEXT,
  PRIMARY KEY (MM_Id)
);

-- ===== MsgTBL =====
CREATE TABLE MsgTBL(
  Msg_Id TEXT,
  Msg_name TEXT,
  PRIMARY KEY (Msg_Id)
);

-- ===== NIP03_Jisya =====
CREATE TABLE NIP03_Jisya(
  KjId INTEGER,
  UwId INTEGER,
  Name TEXT,
  Name2 TEXT,
  Unit TEXT,
  Ft1 TEXT,
  Ft2 TEXT,
  Suryo REAL,
  Uprice REAL,
  Price REAL
);

-- ===== NIP03_Kosyu =====
CREATE TABLE NIP03_Kosyu(
  KjId INTEGER,
  UwId INTEGER,
  Name TEXT
  );

-- ===== NIP05_JGISUB_ItemsTBL =====
CREATE TABLE NIP05_JGISUB_ItemsTBL(
  KM_Name TEXT,
  KM_Price REAL,
  KM_Torihiki TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT
);

-- ===== NIP05_JGI_ItemsTBL =====
CREATE TABLE NIP05_JGI_ItemsTBL(
  KM_Name TEXT,
  KM_YNPrice1 REAL,
  KM_YNPrice2 REAL,
  KM_YNPrice3 REAL,
  KM_YNPrice4 REAL,
  KM_YNPrice5 REAL,
  KM_YNPrice6 REAL,
  KM_YNPrice7 REAL,
  KM_YNPrice8 REAL,
  KM_YNPrice9 REAL,
  KM_YNPrice10 REAL
);

-- ===== NipEditLog =====
CREATE TABLE NipEditLog(
  KjId INTEGER,
  UwId INTEGER,
  PayDate DateTime,
  PYLineNo INTEGER,
  EditType INTEGER,
  DezuraType INTEGER,
  EditDate DateTime,
  EditUserId INTEGER,
  PRIMARY KEY (KjId,UwId,PayDate,PYLineNo)
  );

-- ===== NipEditLogDeleteDetail =====
CREATE TABLE NipEditLogDeleteDetail(
    KjId INTEGER,
    DeleteId INTEGER,
    UwId INTEGER,
    PayDate DATETIME,
    PY_Name TEXT,
    PY_Name2 TEXT,
    PY_Name3 TEXT,
    PY_Vno INTEGER,
    PY_Kind_Sel INTEGER,
    PY_UwId_Sel INTEGER,
    PY_UwId_SelKs INTEGER,
    PY_Suryo REAL,
    PY_Unit TEXT,
    PY_Uprice REAL,
    PY_Price REAL,
    PY_PriceTax REAL,
    PY_Ft1 TEXT,
    PY_Ft2 TEXT,
    PY_SubFt INTEGER,
    PY_TorihikiId INTEGER,
    PY_Torihiki TEXT,
    PY_Tekiyo TEXT,
    PY_FlagAcc INTEGER,
    PY_Yuprice REAL,
    PY_Keiyaku TEXT,
    PY_Check TEXT,
    PY_Hutansya TEXT,
    PRIMARY KEY (KjId,DeleteId)
    );

-- ===== NipEditLogPreviousValue =====
CREATE TABLE NipEditLogPreviousValue(
  KjId INTEGER,
  UwId INTEGER,
  PayDate DateTime,
  PYLineNo INTEGER,
  ColName TEXT,
  PreviousValue TEXT,
  PRIMARY KEY (KjId,UwId,PayDate,PYLineNo,ColName)
  );

-- ===== NipProgreEditLogPreviousValue =====
CREATE TABLE NipProgreEditLogPreviousValue(
  KjId INTEGER,
  UwId INTEGER,
  PayDate DateTime,
  PreviousDekiSui REAL,
  EditDate DateTime,
  EditUserId INTEGER,
  PRIMARY KEY (KjId,UwId,PayDate)
  );

-- ===== PaysSubTBL =====
CREATE TABLE PaysSubTBL(
    PS_KjId INTEGER,
    PS_UwId INTEGER,
    PS_PayDate DATETIME,
    PS_Memo1 TEXT,
    PS_Memo2 TEXT,
    PS_Weather TEXT,
    PS_Temperature INTEGER,
    PS_IsEdited INTEGER,
    PRIMARY KEY (PS_KjId,PS_UwId,PS_PayDate)
);

-- ===== PaysTBL =====
CREATE TABLE PaysTBL(
    PY_KjId INTEGER,
    PY_UwId INTEGER,
    PY_PayDate DATETIME,
    PY_LineNo INTEGER,
    PY_Name TEXT,
    PY_Name2 TEXT,
    PY_Name3 TEXT,
    PY_Vno INTEGER,
    PY_Kind_Sel INTEGER,
    PY_UwId_Sel INTEGER,
    PY_UwId_SelKs INTEGER,
    PY_Suryo REAL,
    PY_Unit TEXT,
    PY_Uprice REAL,
    PY_Price REAL,
    PY_PriceTax REAL,
    PY_Ft1 TEXT,
    PY_Ft2 TEXT,
    PY_SubFt INTEGER,
    PY_TorihikiId INTEGER,
    PY_Torihiki TEXT,
    PY_Tekiyo TEXT,
    PY_FlagAcc INTEGER,
    PY_Yuprice REAL,
    PY_Keiyaku TEXT,
    PY_Check TEXT,
    PY_Hutansya TEXT,
    PRIMARY KEY (PY_KjId,PY_UwId,PY_PayDate,PY_LineNo)
);

-- ===== ProgreTBL =====
CREATE TABLE ProgreTBL(
  PG_KjId INTEGER,
  PG_UwId INTEGER,
  PG_Date DATETIME,
  PG_ZenRuiSui REAL,
  PG_RuiSui REAL,
  RG_DekiSui REAL,
  PG_EditDiv INTEGER,
  PRIMARY KEY (PG_KjId,PG_UwId,PG_Date)
);

-- ===== ReceiveTBL =====
CREATE TABLE ReceiveTBL(
  RE_KjId INTEGER,
  RE_RecId INTEGER,
  RE_Name TEXT,
  RE_RecYoteiDay DATETIME,
  RE_RecYoteiPrice REAL,
  RE_PriceParcent REAL,
  RE_YoteiSumPrice REAL,
  RE_RecDay DATETIME,
  RE_RecPrice REAL,
  RE_TePrice REAL,
  RE_Zankin REAL,
  RE_Tekiyo TEXT,
  PRIMARY KEY (RE_KjId,RE_RecId)
);

-- ===== ShareDek =====
CREATE TABLE ShareDek(
  KjId INTEGER,
  LocalUpdateDateTime DATETIME,
  LocalUpdateUserName TEXT,
  RemoteUpdateDateTime DATETIME,
  RemoteUpdateUserName TEXT,
  PRIMARY KEY (KjId)
);

-- ===== ShareKjs =====
CREATE TABLE ShareKjs(
  KjId INTEGER,
  LocalUpdateDateTime DATETIME,
  LocalUpdateUserName TEXT,
  RemoteUpdateDateTime DATETIME,
  RemoteUpdateUserName TEXT,
  PRIMARY KEY (KjId)
);

-- ===== ShareMST =====
CREATE TABLE ShareMST(
  Id INTEGER,
  LocalUpdateDateTime DATETIME,
  LocalUpdateUserName TEXT,
  RemoteUpdateDateTime DATETIME,
  RemoteUpdateUserName TEXT,
  PRIMARY KEY (Id)
);

-- ===== SharePay =====
CREATE TABLE SharePay(
  KjId INTEGER,
  UwId INTEGER,
  PayDate TEXT,
  LocalUpdateDateTime DATETIME,
  LocalUpdateUserName TEXT,
  RemoteUpdateDateTime DATETIME,
  RemoteUpdateUserName TEXT,
  PRIMARY KEY (KjId,UwId,PayDate)
);

-- ===== ShareUser =====
CREATE TABLE ShareUser(
  UserId INTEGER,
  Id INTEGER,
  LocalUpdateDateTime DATETIME,
  LocalUpdateUserName TEXT,
  RemoteUpdateDateTime DATETIME,
  RemoteUpdateUserName TEXT,
  PRIMARY KEY (UserId,Id)
);

-- ===== SysCtrlTBL =====
CREATE TABLE SysCtrlTBL(
  CL_Id INTEGER,
  CL_OffName TEXT,
  CL_OffPost TEXT,
  CL_OffAdd TEXT,
  CL_OffTel TEXT,
  CL_SysTanto TEXT,
  CL_Simebi INTEGER,
  CL_Getudo TEXT,
  CL_Hanko1 TEXT,
  CL_Hanko2 TEXT,
  CL_Hanko3 TEXT,
  CL_Hanko4 TEXT,
  CL_Hanko5 TEXT,
  CL_GaiYoso INTEGER,
  CL_MMDateF DATETIME,
  CL_JMDateF DATETIME,
  CL_MMFree1 TEXT,
  CL_MMFree2 TEXT,
  CL_MMFree3 TEXT,
  CL_MMFree4 TEXT,
  CL_MMFree5 TEXT,
  CL_MMFree6 TEXT,
  CL_MMKansH REAL,
  CL_JMKansH REAL,
  CL_MMKansKB TEXT,
  CL_JMKansKB TEXT,
  CL_MMZangRitu REAL,
  CL_MMSinyRitu REAL,
  CL_MMKyujRitu REAL,
  CL_MMKyusRitu REAL,
  CL_MMHkyuRitu REAL,
  CL_MMHsinRitu REAL,
  CL_RkKjPrice REAL,
  CL_RkOutRitu REAL,
  CL_RkTaxKB TEXT,
  CL_RkKyoka TEXT,
  CL_KjSaveKind TEXT,
  CL_TblSaveKind TEXT,
  CL_SysSaveKind TEXT,
  CL_HnkUkeKB TEXT,
  CL_UkeUprcKB TEXT,
  CL_YnSuryoKB TEXT,
  CL_TkUprcKB TEXT,
  CL_SkDaysKB TEXT,
  CL_HkyuUprcKB TEXT,
  CL_HsinUprcKB TEXT,
  CL_PswUprcKB TEXT,
  CL_PrndateUprcKB TEXT,
  CL_Simebi_r INTEGER,
  CL_Getudo_r TEXT,
  CL_Simebi_k INTEGER,
  CL_Getudo_k TEXT,
  CL_Yos_anbun TEXT,
  CL_NipNyuKB TEXT,
  CL_YnKsuryoKB TEXT,
  CL_ExcelKB TEXT,
  CL_OffNameUprcKB TEXT,
  CL_SysLock TEXT,
  CL_MemberLock TEXT,
  CL_KikaiLock TEXT,
  CL_TanLock TEXT,
  CL_ItemLock TEXT,
  CL_FrmUnitKB TEXT,
  CL_AdjustYoso INTEGER,
  CL_DezStart DATETIME,
  CL_DezEnd DATETIME,
  CL_RecessTimeS1 DATETIME,
  CL_RecessTimeS2 DATETIME,
  CL_RecessTimeS3 DATETIME,
  CL_RecessTimeS4 DATETIME,
  CL_RecessTimeS5 DATETIME,
  CL_RecessTimeE1 DATETIME,
  CL_RecessTimeE2 DATETIME,
  CL_RecessTimeE3 DATETIME,
  CL_RecessTimeE4 DATETIME,
  CL_RecessTimeE5 DATETIME,
  CL_DezTimeKB TEXT,
  CL_DezTimeSet TEXT,
  CL_KeihiName1 TEXT,
  CL_KeihiName2 TEXT,
  CL_KeihiName3 TEXT,
  CL_KeihiName4 TEXT,
  CL_KeihiName5 TEXT,
  CL_KeihiRitu1 REAL,
  CL_KeihiRitu2 REAL,
  CL_KeihiRitu3 REAL,
  CL_KeihiRitu4 REAL,
  CL_KeihiRitu5 REAL,
  CL_Ft1_1 INTEGER,
  CL_Ft1_2 INTEGER,
  CL_Ft1_3 INTEGER,
  CL_Ft1_4 INTEGER,
  CL_Ft1_5 INTEGER,
  CL_Ft2_1 INTEGER,
  CL_Ft2_2 INTEGER,
  CL_Ft2_3 INTEGER,
  CL_Ft2_4 INTEGER,
  CL_Ft2_5 INTEGER,
  CL_InvoiceNo TEXT,
  PRIMARY KEY (CL_Id)
);

-- ===== SysHasuTBL =====
CREATE TABLE SysHasuTBL(
  HS_Id INTEGER,
  HS_FractionS1 INTEGER,
  HS_ViewS1 INTEGER,
  HS_FractionT1 INTEGER,
  HS_ViewT1 INTEGER,
  HS_FractionK1 INTEGER,
  HS_ViewK1 INTEGER,
  HS_FractionS2 INTEGER,
  HS_ViewS2 INTEGER,
  HS_FractionT2 INTEGER,
  HS_ViewT2 INTEGER,
  HS_FractionK2 INTEGER,
  HS_ViewK2 INTEGER,
  HS_FractionS3 INTEGER,
  HS_ViewS3 INTEGER,
  HS_FractionT3 INTEGER,
  HS_ViewT3 INTEGER,
  HS_FractionK3 INTEGER,
  HS_ViewK3 INTEGER,
  HS_FractionH3 INTEGER,
  HS_ViewH3 INTEGER,
  HS_FractionR INTEGER,
  HS_ViewR INTEGER,
  HS_FractionD INTEGER,
  HS_ViewD INTEGER,
  HS_FractionH INTEGER,
  HS_ViewH INTEGER,
  PRIMARY KEY (HS_Id)
);

-- ===== SysKmkTBL =====
CREATE TABLE SysKmkTBL(
  SU_Id INTEGER,
  SU_Name TEXT,
  SU_Vno INTEGER,
  SU_Default INTEGER,
  SU_Attr INTEGER,
  PRIMARY KEY (SU_Id)
);

-- ===== SysPswdTBL =====
CREATE TABLE SysPswdTBL(
  PW_Id INTEGER,
  PW_Kind INTEGER,
  PW_Code TEXT,
  PRIMARY KEY (PW_Id)
  );

-- ===== SysRoundIdx =====
CREATE TABLE SysRoundIdx(
  RD_Id INTEGER,
  RD_Disabled INTEGER,
  RD_Name TEXT,
  PRIMARY KEY (RD_Id)
  );

-- ===== SysRoundTBL =====
CREATE TABLE SysRoundTBL(
  RD_Id INTEGER,
  RD_LineNo INTEGER,
  RD_TargetCol INTEGER,
  RD_TargetRow INTEGER,
  RD_TargetLevel INTEGER,
  RD_Enabled INTEGER,
  RD_Fraction INTEGER,
  RD_View INTEGER,
  PRIMARY KEY (RD_Id,RD_LineNo)
);

-- ===== SysSubYosoTBL =====
CREATE TABLE SysSubYosoTBL(
  SFT_FT_Id TEXT,
  SFT_Id INTEGER,
  SFT_Name TEXT,
  SFT_Vno INTEGER,
  PRIMARY KEY (SFT_FT_Id,SFT_Id)
);

-- ===== SysYosoTBL =====
CREATE TABLE SysYosoTBL(
  FT_Id TEXT,
  FT_Name TEXT,
  FT_AtlusNo INTEGER,
  FT_DezKB TEXT,
  FT_YsKB TEXT,
  FT_Vno INTEGER,
  FT_Attr INTEGER,
  FT_Trit REAL,
  FT_RealElementType INTEGER,
  PRIMARY KEY (FT_Id)
);

-- ===== TanClass =====
CREATE TABLE TanClass(
  TN_Div INTEGER,
  TN_Id INTEGER,
  TN_Name TEXT,
  TN_Kikaku TEXT,
  TN_Vno INTEGER,
  TN_Level INTEGER,
  TN_ParentId INTEGER,
  TN_Children INTEGER,
  TN_TanCodeCST TEXT,
  TN_MesaiId INTEGER,
  TN_Search TEXT,
  TN_BookCode1 TEXT,
  TN_BookCode2 TEXT,
  TN_Color INTEGER,
  TN_Expanded INTEGER,
  TN_Stat TEXT,
  TN_Attr INTEGER,
  PRIMARY KEY (TN_Div,TN_Id)
);

-- ===== TanClassDetails =====
CREATE TABLE TanClassDetails(
  TN_MesaiId INTEGER,
  TN_UnitCd TEXT,
  TN_Unit TEXT,
  TN_Length REAL,
  TN_Weight REAL,
  TN_Diameter REAL,
  TN_FlagHosei INTEGER,
  TN_FlagKeihi INTEGER,
  TN_Ft1 TEXT,
  TN_Ft2 TEXT,
  TN_SubFt INTEGER,
  TN_Tmemo TEXT,
  TN_Warichin REAL,
  TN_Uprice REAL,
  TN_TorihikiId INTEGER,
  TN_Torihiki TEXT,
  PRIMARY KEY (TN_MesaiId)
);

-- ===== TargetIndex =====
CREATE TABLE TargetIndex(
  TI_KjId INTEGER,
  TI_Id INTEGER,
  TI_DateS DATETIME,
  TI_DateE DATETIME,
  PRIMARY KEY (TI_KjId,TI_Id)
);

-- ===== ThohyoTBL =====
CREATE TABLE ThohyoTBL(
  KM_KjId INTEGER,
  KM_ReportId INTEGER,
  KM_Slevel INTEGER,
  KM_Elevel INTEGER,
  KM_ReportName TEXT,
  KM_DataType INTEGER,
  KM_FormName TEXT,
  KM_LastRepNum INTEGER,
  KM_FormName2 TEXT,
  KM_OutReport INTEGER,
  PRIMARY KEY (KM_KjId,KM_ReportId)
);

-- ===== UnitTBL =====
CREATE TABLE UnitTBL(
  TI_No TEXT,
  TI_Name TEXT,
  TI_Vno INTEGER,
  TI_Attr INTEGER,
  PRIMARY KEY (TI_No)
);

-- ===== UsConstTreeUser =====
CREATE TABLE UsConstTreeUser(
  UserId INTEGER,
  KR_KjId INTEGER,
  KR_TreeId TEXT,
  KR_KjCd TEXT,
  KR_Name TEXT,
  KR_Type INTEGER,
  KR_Vno INTEGER,
  KR_Level INTEGER,
  KR_ParentKjId INTEGER,
  KR_ParentTreeId TEXT,
  KR_Children INTEGER,
  KR_DeleteFlag INTEGER,
  KR_PubViewFlag INTEGER,
  KR_Acceptance INTEGER,
  KR_Kansei TEXT,
  KR_UserId INTEGER,
  KR_UserName TEXT,
  KR_GroupId INTEGER,
  KR_NyuSdate DATETIME,
  KR_Kjhdate DATETIME,
  KR_Ksdate DATETIME,
  KR_Kedate DATETIME,
  KR_Jsdate DATETIME,
  KR_Jedate DATETIME,
  KR_Ydate DATETIME,
  KR_Kandate DATETIME,
  KR_FnYear TEXT,
  KR_JyutyuKBN TEXT,
  KR_Kanmin TEXT,
  KR_KjUke TEXT,
  KR_Kjhname TEXT,
  KR_Kousyu TEXT,
  KR_KjAddP TEXT,
  KR_KjAddr TEXT,
  KR_Bumon TEXT,
  KR_Gdairi TEXT,
  KR_Free1 TEXT,
  KR_Free2 TEXT,
  KR_UkeprcT REAL,
  KR_UkeprcH REAL,
  KR_Memo TEXT,
  KR_SelYM DATETIME,
  KR_YnTtlPrice REAL,
  KR_DkRuiPrice REAL,
  KR_CmRuiPrice REAL,
  KR_Upddate DATETIME,
  KR_Status INTEGER,
  KR_Free3 TEXT,
  KR_Free4 TEXT,
  PRIMARY KEY (UserId,KR_KjId)
);

-- ===== UsConstructTBL =====
CREATE TABLE UsConstructTBL(
  UserId INTEGER,
  KM_KjId INTEGER,
  KM_KjGuid TEXT,
  KM_Vno INTEGER,
  KM_KjName2 TEXT,
  KM_Hencnt INTEGER,
  KM_KjTanto TEXT,
  KM_EgTanto TEXT,
  KM_SgTanto TEXT,
  KM_KjSyu TEXT,
  KM_Tax REAL,
  KM_Pcprc REAL,
  KM_PassWord TEXT,
  KM_RouTanPW TEXT,
  KM_JyuTanPW TEXT,
  KM_MemoBK TEXT,
  KM_Ssdate DATETIME,
  KM_Sedate DATETIME,
  KM_NipNyuKB TEXT,
  KM_YnKsuryoKB TEXT,
  KM_Stat TEXT,
  KM_KeYear DATETIME,
  KM_KoteiKB TEXT,
  KM_KjFlag TEXT,
  KM_HasYosanSorting INTEGER,
  KM_TargetPrice REAL,
  KM_TargetRitu REAL,
  KM_GYnKsuryoKB TEXT,
  PRIMARY KEY (UserId,KM_KjId)
);

-- ===== UsItemNeme =====
CREATE TABLE UsItemNeme(
  UserId INTEGER,
  KN_Id INTEGER,
  KN_Flg TEXT,
  KN_Name TEXT,
  KN_Vno INTEGER,
  KN_Level INTEGER,
  KN_ParentId INTEGER,
  KN_Children INTEGER,
  KN_No TEXT,
  KN_Expanded INTEGER,
  KN_Attr INTEGER,
  PRIMARY KEY (UserId,KN_Id)
);

-- ===== UsItemRatioTarget =====
CREATE TABLE UsItemRatioTarget (
    UserId INTEGER,
    KjId INTEGER NOT NULL,
    ItemId INTEGER NOT NULL,
    TargetItemId INTEGER NOT NULL,
    TargetType INTEGER NOT NULL,
    PRIMARY KEY (UserId, KjId, ItemId, TargetItemId)
);

-- ===== UsItemsKSTBL =====
CREATE TABLE UsItemsKSTBL(
  UserId INTEGER,
  IK_KjId INTEGER,
  IK_UwId INTEGER,
  IK_YnPrice1 REAL,
  IK_YnPrice2 REAL,
  IK_YnPrice3 REAL,
  IK_YnPrice4 REAL,
  IK_YnPrice5 REAL,
  IK_YnPrice6 REAL,
  IK_YnPrice7 REAL,
  IK_YnPrice8 REAL,
  IK_YnPrice9 REAL,
  IK_YnPrice10 REAL,
  PRIMARY KEY (UserId,IK_KjId,IK_UwId)
);

-- ===== UsItemsTBL =====
CREATE TABLE UsItemsTBL(
  UserId INTEGER,
  KM_KjId INTEGER,
  KM_Id INTEGER,
  KM_OnePointFlag INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_EditMode INTEGER,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Search TEXT,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Nsuryo REAL,
  KM_Uksuryo REAL,
  KM_Tksuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_Nprice REAL,
  KM_UkPrice REAL,
  KM_TkPrice REAL,
  KM_UkUprice REAL,
  KM_TkUprice REAL,
  KM_SsUprice REAL,
  KM_HketaS INTEGER,
  KM_HprocS INTEGER,
  KM_HketaT INTEGER,
  KM_HprocT INTEGER,
  KM_HketaK INTEGER,
  KM_HprocK INTEGER,
  KM_ItemType TEXT,
  KM_ItemDiv INTEGER,
  KM_ItemCode TEXT,
  KM_Zpar REAL,
  KM_Zbit1 TEXT,
  KM_Zbit2 TEXT,
  KM_Zbit3 TEXT,
  KM_Zbit4 TEXT,
  KM_Zbit5 TEXT,
  KM_Zauto TEXT,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_TorihikiId INTEGER,
  KM_Torihiki TEXT,
  KM_Tekiyo TEXT,
  KM_SekoSuryo REAL,
  KM_SekoUnitCd TEXT,
  KM_SekoUnit TEXT,
  KM_SekoDays REAL,
  KM_LastUpDate DATETIME,
  KM_Dchange REAL,
  KM_Color INTEGER,
  KM_ReportName TEXT,
  KM_ReportNum INTEGER,
  KM_RepNumHnBit TEXT,
  KM_FlagPrint INTEGER,
  KM_FlagAcc INTEGER,
  KM_Expanded INTEGER,
  KM_Stat TEXT,
  KM_Attr INTEGER,
  KM_Addmode TEXT,
  KM_KjNameSv TEXT,
  KM_Counted INTEGER,
  KM_SortNo INTEGER,
  KM_ItemDetailType INTEGER,
  PRIMARY KEY (UserId,KM_KjId,KM_Id)
);

-- ===== UsKoteiTBL =====
CREATE TABLE UsKoteiTBL(
  UserId INTEGER,
  KT_KjId INTEGER,
  KT_UwId INTEGER,
  KT_Kind INTEGER,
  KT_Date DATETIME,
  KT_OnePointFlag INTEGER,
  KT_DateType INTEGER,
  PRIMARY KEY (UserId,KT_KjId,KT_UwId,KT_Kind,KT_Date)
);

-- ===== UsTanClass =====
CREATE TABLE UsTanClass(
  UserId INTEGER,
  TN_Div INTEGER,
  TN_Id INTEGER,
  TN_Name TEXT,
  TN_Kikaku TEXT,
  TN_Vno INTEGER,
  TN_Level INTEGER,
  TN_ParentId INTEGER,
  TN_Children INTEGER,
  TN_TanCodeCST TEXT,
  TN_MesaiId INTEGER,
  TN_Search TEXT,
  TN_BookCode1 TEXT,
  TN_BookCode2 TEXT,
  TN_Color INTEGER,
  TN_Expanded INTEGER,
  TN_Stat TEXT,
  TN_Attr INTEGER,
  PRIMARY KEY (UserId,TN_Div,TN_Id)
);

-- ===== UserAccount =====
CREATE TABLE UserAccount(
  Id INTEGER,
  Disabled INTEGER,
  Type INTEGER,
  LoginId TEXT,
  AccountType INTEGER,
  Password TEXT,
  UserName TEXT,
  MailAdd TEXT,
  GrooupCnd INTEGER,
  GroupId INTEGER,
  MarsAccessId INTEGER,
  AttrKokuban INTEGER,
  AttrSumaho INTEGER,
  SumahoMode INTEGER,
  MMId INTEGER,
  UpdateTime DATETIME,
  OldSerial TEXT,
  PRIMARY KEY (Id)
);

-- ===== YosanEditLog =====
CREATE TABLE YosanEditLog(
  KjId INTEGER,
  ItemsTBLId INTEGER,
  EditType INTEGER,
  EditDate DATETIME,
  EditUserId INTEGER,
  PRIMARY KEY (KjId,ItemsTBLId)
  );

-- ===== YosanEditLogDeleteDetail =====
CREATE TABLE YosanEditLogDeleteDetail(
  KjId INTEGER,
  Id INTEGER,
  DeletedPath TEXT,
  DeletedReason INTEGER,
  KM_Name TEXT,
  KM_Name2 TEXT,
  KM_Name3 TEXT,
  KM_EditMode INTEGER,
  KM_Vno INTEGER,
  KM_Level INTEGER,
  KM_ParentId INTEGER,
  KM_Children INTEGER,
  KM_Ksuryo REAL,
  KM_Ssuryo REAL,
  KM_Nsuryo REAL,
  KM_Uksuryo REAL,
  KM_Tksuryo REAL,
  KM_Unit TEXT,
  KM_Uprice REAL,
  KM_Price REAL,
  KM_Nprice REAL,
  KM_UkPrice REAL,
  KM_TkPrice REAL,
  KM_UkUprice REAL,
  KM_TkUprice REAL,
  KM_SsUprice REAL,
  KM_ItemType TEXT,
  KM_Zpar REAL,
  KM_Dbit TEXT,
  KM_Ft1 TEXT,
  KM_Ft2 TEXT,
  KM_SubFt INTEGER,
  KM_Torihiki TEXT,
  KM_Tekiyo TEXT,
  KM_LastUpDate DATETIME,
  KM_Attr INTEGER,
  PRIMARY KEY (KjId,Id)
);

-- ===== YosanEditLogPreviousValue =====
CREATE TABLE YosanEditLogPreviousValue(
  KjId INTEGER,
  ItemsTBLId INTEGER,
  YosanEditColName TEXT,
  PreviousValue TEXT, 
  PRIMARY KEY (KjId,ItemsTBLId,YosanEditColName)
);

-- ===== YosoMMTBL =====
CREATE TABLE YosoMMTBL(
  YM_KjId INTEGER,
  YM_CostDate DATETIME,
  YM_Ft1 TEXT,
  YM_CmPrice REAL,
  YM_YsoPrice REAL,
  PRIMARY KEY (YM_KjId,YM_CostDate,YM_Ft1)
);

-- ===== usTanClassDetails =====
CREATE TABLE usTanClassDetails(
  UserId INTEGER,
  TN_MesaiId INTEGER,
  TN_UnitCd TEXT,
  TN_Unit TEXT,
  TN_Length REAL,
  TN_Weight REAL,
  TN_Diameter REAL,
  TN_FlagHosei INTEGER,
  TN_FlagKeihi INTEGER,
  TN_Ft1 TEXT,
  TN_Ft2 TEXT,
  TN_SubFt INTEGER,
  TN_Tmemo TEXT,
  TN_Warichin REAL,
  TN_Uprice REAL,
  TN_TorihikiId INTEGER,
  TN_Torihiki TEXT,
  PRIMARY KEY (UserId,TN_MesaiId)
);

