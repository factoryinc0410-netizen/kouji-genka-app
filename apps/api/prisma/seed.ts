import { hash } from '@node-rs/argon2';
import { PrismaClient, type RoleCode } from '@prisma/client';

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

async function seedAdminUser(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@kgk.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin_dev_password';
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });

  // Argon2id 推奨パラメタ (OWASP 2024 ガイドライン: memory 19 MiB+, iterations 2+)
  const passwordHash = await hash(password, {
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65_536),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
  });

  await prisma.user.upsert({
    where: { email },
    create: { email, name: '初期管理者', passwordHash, roleId: adminRole.id },
    update: {},
  });
}

async function main(): Promise<void> {
  await seedRoles();
  await seedAdminUser();
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
