import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';

test.describe
  .serial('admin auth flow', () => {
    test('未ログインで /admin/users にアクセスすると /login へリダイレクト', async ({ page }) => {
      await page.goto('/admin/users');
      await expect(page).toHaveURL(/\/login(\?next=.*)?$/);
      await expect(page.getByText('kouji-genka にログイン')).toBeVisible();
    });

    test('login → 新規ユーザ作成 → 一覧反映 → logout', async ({ page }) => {
      // --- login ---
      await page.goto('/login');
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'ログイン' }).click();

      await expect(page).toHaveURL(/\/admin\/users/);
      await expect(page.getByRole('heading', { name: 'ユーザ管理' })).toBeVisible();
      await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();

      // --- create user ---
      const uniqueEmail = `e2e-${Date.now()}@kgk.local`;
      await page.getByRole('button', { name: '新規作成' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('input[name="email"]').fill(uniqueEmail);
      await dialog.locator('input[name="name"]').fill('E2E テストユーザ');
      await dialog.locator('input[name="password"]').fill('verysecret1234');
      await dialog.locator('select[name="roleCode"]').selectOption('viewer');
      await dialog.getByRole('button', { name: '作成' }).click();

      // ダイアログが閉じて一覧に追加される
      await expect(dialog).toBeHidden({ timeout: 5_000 });
      await expect(page.getByText(uniqueEmail)).toBeVisible({ timeout: 5_000 });

      // --- logout ---
      page.on('dialog', (d) => d.accept());
      await page.getByRole('button', { name: 'ログアウト' }).click();
      await expect(page).toHaveURL(/\/login(\?.*)?$/);
    });
  });
