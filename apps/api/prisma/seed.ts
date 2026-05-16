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

async function main(): Promise<void> {
  await seedRoles();
  const adminId = await seedAdminUser();
  const customerIdByCode = await seedCustomers();
  await seedProjects(customerIdByCode, adminId);
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
