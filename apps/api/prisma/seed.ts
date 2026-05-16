import { hash } from '@node-rs/argon2';
import {
  type ConstructionType,
  type CustomerType,
  Prisma,
  PrismaClient,
  type ProjectStatus,
  type ProjectType,
  type RoleCode,
} from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_DEFINITIONS: ReadonlyArray<{
  code: RoleCode;
  name: string;
  description: string;
}> = [
  { code: 'admin', name: '管理者', description: '全データ・全機能、ユーザ管理' },
  { code: 'planner', name: '予算編成', description: '担当工事の予算編集、出来高承認' },
  { code: 'field', name: '現場', description: '担当工事の日報・出面入力' },
  { code: 'accounting', name: '経理', description: '全工事の支払・入金、帳票出力' },
  { code: 'viewer', name: '閲覧', description: '担当工事の閲覧のみ' },
];

async function seedRoles(): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: role,
      update: { name: role.name, description: role.description },
    });
  }
}

async function seedAdminUser(): Promise<string> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@kgk.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin_dev_password';
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });

  // Argon2id 推奨パラメタ (OWASP 2024 ガイドライン: memory 19 MiB+, iterations 2+)
  const passwordHash = await hash(password, {
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65_536),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
  });

  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: '初期管理者', passwordHash, roleId: adminRole.id },
    update: {},
  });
  return admin.id;
}

interface CustomerSeed {
  code: string;
  name: string;
  nameKana?: string;
  customerType: CustomerType;
  address?: string;
  phone?: string;
  contactPerson?: string;
  notes?: string;
}

const CUSTOMER_SEEDS: ReadonlyArray<CustomerSeed> = [
  {
    code: 'C0001',
    name: '株式会社サンプル工務店',
    nameKana: 'カブシキガイシャサンプルコウムテン',
    customerType: 'general',
    address: '東京都千代田区丸の内 1-1-1',
    phone: '03-0000-0001',
    contactPerson: '山本 太郎',
    notes: '元請。月末締め翌月末払い。',
  },
  {
    code: 'C0002',
    name: '〇〇市役所',
    nameKana: 'マルマルシヤクショ',
    customerType: 'client',
    address: '〇〇県〇〇市役所通り 2-2',
    phone: '0000-00-0002',
    contactPerson: '都市整備課',
    notes: '公共工事発注者。請求書 PDF 必須。',
  },
];

async function seedCustomers(): Promise<Map<string, string>> {
  const idByCode = new Map<string, string>();
  for (const c of CUSTOMER_SEEDS) {
    const created = await prisma.customer.upsert({
      where: { code: c.code },
      create: c,
      update: {
        name: c.name,
        nameKana: c.nameKana,
        customerType: c.customerType,
        address: c.address,
        phone: c.phone,
        contactPerson: c.contactPerson,
        notes: c.notes,
      },
    });
    idByCode.set(c.code, created.id);
  }
  return idByCode;
}

interface ProjectSeed {
  code: string;
  name: string;
  customerCode: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
  contractAmount: bigint;
  status: ProjectStatus;
  projectType: ProjectType;
  constructionType: ConstructionType;
  notes?: string;
}

const PROJECT_SEEDS: ReadonlyArray<ProjectSeed> = [
  {
    code: '2026-001',
    name: '〇〇ビル新築工事',
    customerCode: 'C0001',
    location: '東京都千代田区丸の内 1-1-1',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    contractAmount: 250_000_000n,
    status: 'in_progress',
    projectType: 'private',
    constructionType: 'building',
    notes: 'サンプル: 民間ビル新築。',
  },
  {
    code: '2026-002',
    name: '駅前広場改修工事',
    customerCode: 'C0002',
    location: '〇〇県〇〇市駅前 1',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-12-20'),
    contractAmount: 48_000_000n,
    status: 'bidding',
    projectType: 'public',
    constructionType: 'renovation',
    notes: 'サンプル: 公共改修工事 (受注前)。',
  },
];

async function seedProjects(
  customerIdByCode: Map<string, string>,
  managerId: string,
): Promise<void> {
  for (const p of PROJECT_SEEDS) {
    const customerId = customerIdByCode.get(p.customerCode);
    if (!customerId) {
      throw new Error(`Seed: customer ${p.customerCode} not found`);
    }
    await prisma.project.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        customerId,
        location: p.location,
        startDate: p.startDate,
        endDate: p.endDate,
        contractAmount: new Prisma.Decimal(p.contractAmount.toString()),
        status: p.status,
        projectType: p.projectType,
        constructionType: p.constructionType,
        managerUserId: managerId,
        notes: p.notes,
      },
      update: {
        name: p.name,
        customerId,
        location: p.location,
        startDate: p.startDate,
        endDate: p.endDate,
        contractAmount: new Prisma.Decimal(p.contractAmount.toString()),
        status: p.status,
        projectType: p.projectType,
        constructionType: p.constructionType,
        notes: p.notes,
      },
    });
  }
}

// ===================================================================
// Budgets & BudgetItems (W4 T21)
// ===================================================================

/**
 * 1 つの Project (2026-001) に対し、draft Budget を 1 つだけ生成。
 * サンプル明細は以下のツリー (MARS 風):
 *   §1 直接工事費 [section, level=0]
 *    ├─ 土工事 [composite, level=1]
 *    │   ├─ 掘削 (機械)  数量 120.5 m3, 単価 1,200 円
 *    │   └─ 人工         数量   2.5 人工, 単価 25,000 円
 *    └─ 鉄筋工事 (材料) [detail, level=1] 数量 8,500 kg, 単価 180 円
 *   §2 共通仮設費 (経費) [detail, level=0] 数量 1 式, 単価 500,000 円
 *
 * version は (projectId, version) UNIQUE のため、既に存在する場合は no-op で skip。
 */
async function seedBudgetForFirstProject(): Promise<void> {
  const project = await prisma.project.findUnique({ where: { code: '2026-001' } });
  if (!project) return;

  const existing = await prisma.budget.findUnique({
    where: { projectId_version: { projectId: project.id, version: 1 } },
  });
  if (existing) return;

  const dec = (s: string): Prisma.Decimal => new Prisma.Decimal(s);

  // ---------- ツリー構造 (display_order は 1000 刻みで挿入余地を残す) ----------
  // §1 直接工事費 (section)
  //   1-1 土工事 (composite)
  //     1-1-1 掘削 (machine)
  //     1-1-2 人工 (labor)
  //   1-2 鉄筋工事 (material)
  // §2 共通仮設費 (expense)

  await prisma.$transaction(async (tx) => {
    // Budget 本体
    const budget = await tx.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'draft',
        title: '初期予算 (v1)',
        notes: 'シードデータ: サンプルの内訳ツリー (土工事 / 鉄筋 / 共通仮設費)',
        // totalAmount は明細投入後にまとめて更新
      },
    });

    // §1 直接工事費 (section)
    const s1 = await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: null,
        level: 0,
        displayOrder: 1000,
        kind: 'section',
        code: '1',
        name: '直接工事費',
        // amount は子合計、ここでは 0 のまま (下で更新)
      },
    });

    // §1.1 土工事 (composite)
    const c11 = await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: s1.id,
        level: 1,
        displayOrder: 1000,
        kind: 'composite',
        code: '1-1',
        name: '土工事',
        unit: '式',
        quantity: dec('1.0000'),
      },
    });

    // §1.1.1 掘削 (detail / machine)
    const d111_qty = dec('120.5000');
    const d111_price = dec('1200');
    const d111_amount = d111_qty.mul(d111_price).toDecimalPlaces(0);
    await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: c11.id,
        level: 2,
        displayOrder: 1000,
        kind: 'detail',
        code: '1-1-1',
        name: '掘削',
        spec: 'バックホウ 0.45 m3 級',
        unit: 'm3',
        costElement: 'machine',
        quantity: d111_qty,
        unitPrice: d111_price,
        amount: d111_amount,
      },
    });

    // §1.1.2 人工 (detail / labor)
    const d112_qty = dec('2.5000');
    const d112_price = dec('25000');
    const d112_amount = d112_qty.mul(d112_price).toDecimalPlaces(0);
    await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: c11.id,
        level: 2,
        displayOrder: 2000,
        kind: 'detail',
        code: '1-1-2',
        name: '土工 (普通作業員)',
        unit: '人工',
        costElement: 'labor',
        quantity: d112_qty,
        unitPrice: d112_price,
        amount: d112_amount,
      },
    });

    // §1.2 鉄筋工事 (detail / material) — 単一の葉。代価表を持たない例
    const d12_qty = dec('8500.0000');
    const d12_price = dec('180');
    const d12_amount = d12_qty.mul(d12_price).toDecimalPlaces(0);
    await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: s1.id,
        level: 1,
        displayOrder: 2000,
        kind: 'detail',
        code: '1-2',
        name: '鉄筋 (SD345)',
        spec: 'D13 〜 D22 混合',
        unit: 'kg',
        costElement: 'material',
        quantity: d12_qty,
        unitPrice: d12_price,
        amount: d12_amount,
      },
    });

    // §2 共通仮設費 (detail / expense)
    const s2_qty = dec('1.0000');
    const s2_price = dec('500000');
    const s2_amount = s2_qty.mul(s2_price).toDecimalPlaces(0);
    await tx.budgetItem.create({
      data: {
        budgetId: budget.id,
        parentId: null,
        level: 0,
        displayOrder: 2000,
        kind: 'detail',
        code: '2',
        name: '共通仮設費',
        unit: '式',
        costElement: 'expense',
        quantity: s2_qty,
        unitPrice: s2_price,
        amount: s2_amount,
      },
    });

    // ---------- 集計: composite と section の amount を子合計で更新 ----------
    // §1.1 (composite) の amount = 子合計
    const c11Sum = d111_amount.plus(d112_amount);
    await tx.budgetItem.update({ where: { id: c11.id }, data: { amount: c11Sum } });

    // §1 (section) の amount = §1.1 + §1.2
    const s1Sum = c11Sum.plus(d12_amount);
    await tx.budgetItem.update({ where: { id: s1.id }, data: { amount: s1Sum } });

    // Budget.totalAmount = level=0 (§1 + §2) の合計
    const total = s1Sum.plus(s2_amount);
    await tx.budget.update({ where: { id: budget.id }, data: { totalAmount: total } });
  });
}

async function main(): Promise<void> {
  await seedRoles();
  const adminId = await seedAdminUser();
  const customerIdByCode = await seedCustomers();
  await seedProjects(customerIdByCode, adminId);
  await seedBudgetForFirstProject();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
