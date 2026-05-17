import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';

const PLANNER_PASSWORD = 'planner_dev_password';

async function login(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  // LoginPage は useSearchParams のため Suspense でラップされており、fallback の
  // <LoginShell pending /> が一瞬 disabled な "ログイン中…" ボタンを出す。
  // 解決後の enabled な submit ボタンを掴むため、 textContent='ログイン' を明示
  // して待ってから click する。
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  const submit = page.locator('form button[type="submit"]:not([disabled])');
  await submit.waitFor({ state: 'visible' });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function logout(page: import('@playwright/test').Page): Promise<void> {
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
}

test.describe
  .serial('admin → planner UPP assignment flow', () => {
    test('admin が planner を工事にアサインすると planner の /projects に表示される', async ({
      page,
    }) => {
      const plannerEmail = `e2e-planner-${Date.now()}@kgk.local`;

      // ============================================================
      // Phase 1: admin が planner ユーザを作成
      // ============================================================
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      // T35: ログイン後は dashboard に着くので、ユーザ管理へ明示遷移
      await expect(page).toHaveURL(/\/admin\/(dashboard|users)/);
      await page.getByRole('link', { name: 'ユーザ管理' }).click();
      await expect(page).toHaveURL(/\/admin\/users$/);

      await page.getByRole('button', { name: '新規作成' }).click();
      const userDialog = page.getByRole('dialog');
      await userDialog.locator('input[name="email"]').fill(plannerEmail);
      await userDialog.locator('input[name="name"]').fill('E2E Planner');
      await userDialog.locator('input[name="password"]').fill(PLANNER_PASSWORD);
      await userDialog.locator('select[name="roleCode"]').selectOption('planner');
      await userDialog.getByRole('button', { name: '作成' }).click();
      await expect(userDialog).toBeHidden({ timeout: 5_000 });
      await expect(page.getByText(plannerEmail)).toBeVisible();

      // ============================================================
      // Phase 2: admin が 2026-001 工事の詳細を開き、planner をアサイン
      // ============================================================
      await page.getByRole('link', { name: '工事管理' }).click();
      await expect(page).toHaveURL(/\/admin\/projects$/);

      const targetRow = page.locator('tr', { hasText: '2026-001' });
      await expect(targetRow).toBeVisible();
      await targetRow.getByRole('link', { name: '詳細' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+$/);
      await expect(page.getByRole('heading', { name: /2026-001/ })).toBeVisible();

      // メンバーセクションに「メンバーを追加」が存在
      await page.getByRole('button', { name: 'メンバーを追加' }).click();
      const grantDialog = page.getByRole('dialog');
      await expect(grantDialog).toBeVisible();
      // option の label には「氏名 — email (ロール名)」が入る。email を含む option の value を拾う
      const userSelect = grantDialog.locator('#upp-user');
      const plannerValue = await userSelect
        .locator(`option:has-text("${plannerEmail}")`)
        .first()
        .getAttribute('value');
      if (!plannerValue) throw new Error(`option for ${plannerEmail} not found`);
      await userSelect.selectOption(plannerValue);
      // canView は default ON / canEdit は default OFF のまま
      await grantDialog.getByRole('button', { name: '付与' }).click();
      await expect(grantDialog).toBeHidden({ timeout: 5_000 });

      // 一覧の UPP テーブルに planner が登場
      const memberRow = page.locator('tr', { hasText: plannerEmail });
      await expect(memberRow).toBeVisible({ timeout: 5_000 });
      await expect(memberRow).toContainText('予算編成');

      // ============================================================
      // Phase 3: admin としてログアウト → planner でログイン
      // ============================================================
      await logout(page);

      await login(page, plannerEmail, PLANNER_PASSWORD);
      // planner も dashboard に着く (admin 限定 menu があっても、ダッシュボード自体は誰でも見える)
      await expect(page).toHaveURL(/\/admin\/(dashboard|users|projects)/);

      // /projects へ移動 (planner も自分の画面は見える: API 側で whereForView)
      await page.getByRole('link', { name: '工事一覧' }).click();
      await expect(page).toHaveURL(/\/projects$/);

      // アサインされた 2026-001 が見えるはず
      const visibleRow = page.locator('tr', { hasText: '2026-001' });
      await expect(visibleRow).toBeVisible({ timeout: 5_000 });
      // アサインされていない 2026-002 は見えない
      await expect(page.locator('tr', { hasText: '2026-002' })).toHaveCount(0);

      // ============================================================
      // Phase 4: 後始末: admin に戻り、API 直叩きで UPP 解除 + planner ユーザ削除
      //   (UI フローでも検証済みなので、ここはクリーンアップに専念)
      //   plannerEmail には Date.now() を含めるので重複の心配はないが、
      //   累積するとシードが汚れるため毎回片付ける。
      // ============================================================
      await logout(page);

      const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:3001/api/v1';
      const req = page.request;
      const loginRes = await req.post(`${apiBase}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(loginRes.ok()).toBeTruthy();

      // project_id (2026-001) と planner.id を取得
      const projectsRes = await req.get(`${apiBase}/projects?limit=200`);
      const projectsBody = (await projectsRes.json()) as {
        items: Array<{ id: string; code: string }>;
      };
      const targetProject = projectsBody.items.find((p) => p.code === '2026-001');
      const usersRes = await req.get(`${apiBase}/users?limit=200`);
      const usersBody = (await usersRes.json()) as {
        items: Array<{ id: string; email: string }>;
      };
      const targetUser = usersBody.items.find((u) => u.email === plannerEmail);

      if (targetProject && targetUser) {
        await req.delete(`${apiBase}/projects/${targetProject.id}/permissions/${targetUser.id}`);
        await req.delete(`${apiBase}/users/${targetUser.id}`);
      }
    });
  });
