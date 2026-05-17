# ADR-002 — 将来の Project.department 拡張設計

- **Status**: Proposed (Phase 2 で実施)
- **Date**: 2026-05-17
- **Deciders**: yoshino (factoryinc0410@gmail.com)
- **関連**: ADR-001 (アドオン統合方式)

---

## 1. コンテキスト

ADR-001 により、kouji-genka (KGK) は Phase 1 において「土木部のみで先行運用」する方針が確定した。`Project.department` カラムは現時点では追加せず、土木部メンバには Factoryskills 側で `kouji_genka` feature を付与する RBAC と、KGK 内部の工事単位 ABAC (`user_project_permissions`) のみで制御する。

将来 (Phase 2) に **建築部** および **管理部** からも KGK を利用する運用に拡張する際、以下が必要になる:

- 工事を部署単位で論理分離する (土木部のメンバが建築部の工事を一覧で見られないようにする)
- ダッシュボードのステータス分布・承認待ち・予算カバレッジを部署別に絞り込む
- 既存全工事を「土木部」として安全に backfill する (Phase 1 開始時の前提)

本 ADR では Phase 2 実施時に取るべきデータモデル設計と、ABAC 拡張案を**事前に**整理しておく。

## 2. 検討した選択肢

### A. `Project.department` enum カラムを追加 (採用候補)
```prisma
enum ProjectDepartment {
  civil_engineering
  architecture
  management
}

model Project {
  // ...既存カラム
  department ProjectDepartment @default(civil_engineering)
}
```

### B. `Department` テーブル + `Project.departmentId` 外部キー
- 将来「部署を増減できる」「部署名を変更できる」要件が出てきた場合に拡張性が高い。
- 一方、業界慣行として「土木部・建築部・管理部」は組織レベルで固定的であり、enum で十分。

### C. `User.department` のみで運用し、Project 側には持たせない
- 「ユーザがどの部署か」だけで判定し、工事自体には部署を持たせない。
- 却下理由: 「土木部メンバが管理部の工事を保守的に見たい」など部署横断のユースケースを表現できなくなる。Project 側に独立した属性として持つほうが筋。

## 3. 推奨決定 (Phase 2 実施時に正式採用)

**A 案を採用する** (`Project.department` enum + デフォルト `civil_engineering`)。

理由:
- 業界実態として部署は固定的、enum で十分
- マイグレーション 1 本で完結 (`add_department_to_projects`)
- 既存全件は default 値で安全に backfill 可能
- ProjectAccessService.whereForView() に AND 合成しやすい

## 4. 実施手順 (Phase 2 で参照する)

### Step 1 — schemas パッケージ
```ts
// packages/schemas/src/projects.ts
export const PROJECT_DEPARTMENTS = ['civil_engineering', 'architecture', 'management'] as const;
export const ProjectDepartmentSchema = z.enum(PROJECT_DEPARTMENTS);
export type ProjectDepartment = z.infer<typeof ProjectDepartmentSchema>;

export const PROJECT_DEPARTMENT_LABELS: Record<ProjectDepartment, string> = {
  civil_engineering: '土木部',
  architecture: '建築部',
  management: '管理部',
};

// ProjectSchema / CreateProjectRequest / UpdateProjectRequest に department フィールド追加
```

### Step 2 — Prisma マイグレーション
```bash
pnpm --filter @kgk/api prisma migrate dev --name add_department_to_projects
```

```sql
-- 自動生成される migration.sql の例
CREATE TYPE "ProjectDepartment" AS ENUM ('civil_engineering', 'architecture', 'management');
ALTER TABLE "projects" ADD COLUMN "department" "ProjectDepartment" NOT NULL DEFAULT 'civil_engineering';
CREATE INDEX "projects_department_idx" ON "projects"("department");
```

### Step 3 — User 側にも department を持たせるか
- **オプション 3a (推奨)**: ユーザ部署は Factoryskills 側に持ち (`users.department`)、KGK は SSO / SAML / OIDC で受け取った claims から判断する → Phase 2 で SSO 統合 (ADR-003) と一緒に実装するのが筋。
- **オプション 3b**: KGK 側にも `User.department` カラムを追加して二重管理する。Phase 1 で SSO がない期間の暫定策。

### Step 4 — ABAC への合成
```ts
// apps/api/src/modules/auth/project-access.service.ts
async whereForView(actorId: string): Promise<Prisma.ProjectWhereInput> {
  const actor = await this.prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    include: { role: true },
  });
  if (actor.role.code === 'admin') {
    return {}; // admin は全部署横断
  }
  return {
    AND: [
      // 既存: 工事単位 UPP
      { permissions: { some: { userId: actorId, canView: true } } },
      // 新規: 部署フィルタ (User.department と一致する Project のみ)
      { department: actor.department },
    ],
  };
}
```

### Step 5 — ダッシュボード集計
- `DashboardService.getSummary()` の 3 つの Promise.all クエリすべてに上記の `whereForView` を流すだけで部署別集計が完了する (既に T35 でこの構造になっている)。

### Step 6 — UI
- 工事作成ダイアログに部署 select を追加 (admin のみ編集可、それ以外は default 値 = ログインユーザの部署)
- ダッシュボードのカード上部に「土木部の集計を表示中」のラベル
- 部署横断表示は admin のみ可

### Step 7 — テスト追加
- vitest: `ProjectAccessService` に「部署が異なる工事は見えない」テストを追加
- E2E: 「建築部ユーザでログイン → /admin/projects に土木部の工事が出ない」シナリオを追加

## 5. 既存全件の backfill 戦略

Phase 2 開始時点で既に DB に存在する Project レコードは、全て `department = 'civil_engineering'` で backfill される (上記マイグレーションの DEFAULT 値が効く)。

これは ADR-001 で「Phase 1 は土木部のみで先行運用」を前提としているため、業務的に整合する。建築部・管理部の Project は Phase 2 開始後に新規作成される。

万が一、Phase 1 期間中に「テスト用」「実験的に」管理部や建築部の工事を入れていた場合は、マイグレーション後に手動 SQL で `UPDATE projects SET department = 'architecture' WHERE code LIKE 'ARC-%'` のような移行作業を行う。

## 6. 採用しなかった理由 (B / C 案)

### B 案 (Department テーブル) の保留
- 「将来部署が増えるかもしれない」は YAGNI。enum で必要十分。
- もし将来「子会社が独自部署を持ちたい」レベルの拡張があれば、その時点で migration で enum を増やせばよい (Postgres は `ALTER TYPE ... ADD VALUE` で可能)。

### C 案 (User.department のみ) の却下
- 「土木部メンバが管理部の工事の予算消化率を保守的に見たい」「監査用に admin が全部署横断で集計したい」など、Project 側に独立した属性として持っているほうが表現できるユースケースが多い。
- Project に持たせる方が、ダッシュボード等の集計クエリが素直 (`WHERE department = ?` で済む)。

## 7. 参考

- `apps/api/src/modules/auth/project-access.service.ts` — Phase 2 で `whereForView` 拡張対象
- `apps/api/src/modules/dashboard/dashboard.service.ts` — Phase 2 で部署別集計に変わる対象
- `packages/schemas/src/projects.ts` — Phase 2 で `ProjectDepartmentSchema` 追加対象
- ADR-001 — 本 ADR の前提条件
