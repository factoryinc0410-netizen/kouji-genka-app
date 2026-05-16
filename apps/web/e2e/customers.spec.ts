import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  // Suspense fallback の disabled な「ログイン中…」を避けて enabled な submit を待つ
  const submit = page.locator('form button[type="submit"]:not([disabled])');
  await submit.waitFor({ state: 'visible' });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe
  .serial('admin customers CRUD flow', () => {
    test('admin による 新規作成 → 一覧表示 → 編集 → 論理削除', async ({ page }) => {
      await loginAsAdmin(page);

      // サイドバーから取引先管理へ
      await page.getByRole('link', { name: '取引先管理' }).click();
      await expect(page).toHaveURL(/\/admin\/customers$/);
      await expect(page.getByRole('heading', { name: '取引先管理' })).toBeVisible();

      // シードの C0001 / C0002 が表示されている
      await expect(page.getByText('C0001')).toBeVisible();

      // --- 新規作成 ---
      const uniqueCode = `E2E-${Date.now().toString().slice(-9)}`;
      await page.getByRole('button', { name: '新規作成' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('#c-code').fill(uniqueCode);
      await dialog.locator('#c-name').fill('E2E 取引先株式会社');
      await dialog.locator('#c-kana').fill('イーツーイートリヒキサキ');
      await dialog.locator('#c-type').selectOption('subcontractor');
      await dialog.locator('#c-address').fill('東京都港区テスト 1-2-3');
      await dialog.locator('#c-phone').fill('03-1234-5678');
      await dialog.locator('#c-email').fill(`e2e-${Date.now()}@example.com`);
      await dialog.locator('#c-contact').fill('テスト 担当');
      await dialog.getByRole('button', { name: '作成' }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // 一覧に反映
      const createdRow = page.locator('tr', { hasText: uniqueCode });
      await expect(createdRow).toBeVisible({ timeout: 10_000 });
      await expect(createdRow).toContainText('E2E 取引先株式会社');
      await expect(createdRow).toContainText('外注');

      // --- 重複コードで 409 → code フィールドにエラー ---
      await page.getByRole('button', { name: '新規作成' }).click();
      const dupDialog = page.getByRole('dialog');
      await expect(dupDialog).toBeVisible();
      await dupDialog.locator('#c-code').fill(uniqueCode);
      await dupDialog.locator('#c-name').fill('重複テスト');
      await dupDialog.getByRole('button', { name: '作成' }).click();
      // ダイアログは閉じず、フィールドに赤字エラー
      await expect(dupDialog).toBeVisible();
      await expect(dupDialog.getByText('この取引先コードは既に登録されています')).toBeVisible({
        timeout: 5_000,
      });
      // キャンセルで閉じる
      await dupDialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(dupDialog).toBeHidden();

      // --- 編集 ---
      await createdRow.getByRole('button', { name: '編集' }).click();
      const editDialog = page.getByRole('dialog');
      await expect(editDialog).toBeVisible();
      await editDialog.locator('#c-name').fill('E2E 取引先株式会社 (更新)');
      await editDialog.locator('#c-type').selectOption('supplier');
      await editDialog.getByRole('button', { name: '保存' }).click();
      await expect(editDialog).toBeHidden({ timeout: 10_000 });

      const updatedRow = page.locator('tr', { hasText: uniqueCode });
      await expect(updatedRow).toContainText('E2E 取引先株式会社 (更新)');
      await expect(updatedRow).toContainText('仕入');

      // --- 論理削除 ---
      page.on('dialog', (d) => d.accept());
      await updatedRow.getByRole('button', { name: '削除' }).click();
      // 一覧から消える (論理削除 → list が deletedAt is null で絞られるため非表示)
      await expect(page.locator('tr', { hasText: uniqueCode })).toHaveCount(0, {
        timeout: 10_000,
      });
    });
  });
