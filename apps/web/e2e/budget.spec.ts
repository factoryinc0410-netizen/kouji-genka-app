import { expect, type Page, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:3001/api/v1';

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  const submit = page.locator('form button[type="submit"]:not([disabled])');
  await submit.waitFor({ state: 'visible' });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe
  .serial('budget tree UI', () => {
    test('シードの内訳ツリーが展開表示され、インライン編集でロールアップが反映される', async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // 工事管理 → 2026-001 詳細 → 実行予算を開く
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByRole('heading', { name: /実行予算/ })).toBeVisible();

      // 初期 totalAmount = 2,237,100
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // 代表的な行が表示されている (uniqueness が高い葉/代価コードで確認)
      await expect(page.locator('tr', { hasText: '1-1-1' })).toBeVisible();
      await expect(page.locator('tr', { hasText: '1-1-2' })).toBeVisible();
      await expect(page.locator('tr', { hasText: '掘削' })).toBeVisible();
      await expect(page.locator('tr', { hasText: '鉄筋 (SD345)' })).toBeVisible();
      // 初期の中間集計値
      await expect(page.getByText('207,100', { exact: false })).toBeVisible(); // composite 1-1
      await expect(page.getByText('1,737,100', { exact: false })).toBeVisible(); // section 1

      // --- d111 (1-1-1) の数量セルを 120.5 → 200 に編集 ---
      const d111Row = page.locator('tr', { hasText: '1-1-1' });
      // input は detail のみ。最初の input が quantity、2 つ目が unitPrice
      const qtyInput = d111Row.locator('input').nth(0);
      await expect(qtyInput).toHaveValue('120.5');
      await qtyInput.click();
      await qtyInput.fill('200');
      await qtyInput.blur();

      // サーバ再計算後、totalAmount=2,332,500 / section 1=1,832,500 / composite 1-1=302,500 に反映
      await expect(page.getByText('2,332,500 円')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('302,500', { exact: false })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('1,832,500', { exact: false })).toBeVisible({ timeout: 5_000 });

      // --- 後始末: API 直叩きで d111 を 120.5 に戻す ---
      const req = page.request;
      const loginRes = await req.post(`${API_BASE}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(loginRes.ok()).toBeTruthy();
      const projects = (await (await req.get(`${API_BASE}/projects`)).json()) as {
        items: Array<{ id: string; code: string }>;
      };
      const project = projects.items.find((p) => p.code === '2026-001');
      if (!project) throw new Error('seed project 2026-001 missing');
      const budgets = (await (
        await req.get(`${API_BASE}/projects/${project.id}/budgets`)
      ).json()) as { items: Array<{ id: string }> };
      const budget = budgets.items[0];
      if (!budget) throw new Error('seed budget missing');
      const tree = (await (
        await req.get(`${API_BASE}/projects/${project.id}/budgets/${budget.id}/items`)
      ).json()) as { items: Array<{ id: string; code: string | null; lockVersion: number }> };
      const d111 = tree.items.find((i) => i.code === '1-1-1');
      if (!d111) throw new Error('seed d111 missing');
      const revertRes = await req.patch(
        `${API_BASE}/projects/${project.id}/budgets/${budget.id}/items/${d111.id}`,
        { data: { lockVersion: d111.lockVersion, quantity: '120.5' } },
      );
      expect(revertRes.ok()).toBeTruthy();
    });
  });
