import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/admin\/(dashboard|users)/);
}

test.describe
  .serial('admin projects flow', () => {
    test('admin login → /admin/projects → 新規工事作成 → /projects に反映', async ({ page }) => {
      await loginAsAdmin(page);

      // サイドバーから工事管理へ
      await page.getByRole('link', { name: '工事管理' }).click();
      await expect(page).toHaveURL(/\/admin\/projects/);
      await expect(page.getByRole('heading', { name: '工事管理' })).toBeVisible();

      // シードの 2 件 (2026-001 / 2026-002) が表示されているはず
      await expect(page.getByText('2026-001')).toBeVisible();

      // --- 新規作成 ---
      const uniqueCode = `E2E-${Date.now().toString().slice(-9)}`;
      await page.getByRole('button', { name: '新規作成' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('#p-code').fill(uniqueCode);
      await dialog.locator('#p-name').fill('E2E テスト工事');

      // 取引先 select の最初の (空でない) 選択肢
      const customerSelect = dialog.locator('#p-customer');
      const firstCustomerValue = await customerSelect
        .locator('option')
        .nth(1)
        .getAttribute('value');
      if (firstCustomerValue) {
        await customerSelect.selectOption(firstCustomerValue);
      }

      // 金額入力 (カンマ表示されることを確認)
      await dialog.locator('#p-amount').fill('250000000');
      await expect(dialog.locator('#p-amount')).toHaveValue('250,000,000');

      // T34: status は通常編集フォームから disabled。新規作成時は default の bidding のまま、
      // 着工後に詳細ページのワークフローボタンから in_progress 等へ遷移する想定。
      await dialog.locator('#p-type').selectOption('private');
      await dialog.locator('#p-ctype').selectOption('building');

      await dialog.getByRole('button', { name: '作成' }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // 一覧 (/admin/projects) に反映
      const adminRow = page.locator('tr', { hasText: uniqueCode });
      await expect(adminRow).toBeVisible({ timeout: 10_000 });
      await expect(adminRow).toContainText('E2E テスト工事');
      await expect(adminRow).toContainText('250,000,000');

      // /projects (全ロール用) でも見える
      await page.getByRole('link', { name: '工事一覧' }).click();
      await expect(page).toHaveURL(/\/projects$/);
      const publicRow = page.locator('tr', { hasText: uniqueCode });
      await expect(publicRow).toBeVisible({ timeout: 10_000 });
      await expect(publicRow).toContainText('250,000,000');
    });

    test('重複した工事番号で 409 が来ると code フィールドにエラー表示', async ({ page }) => {
      await loginAsAdmin(page);
      await page.getByRole('link', { name: '工事管理' }).click();
      await expect(page).toHaveURL(/\/admin\/projects/);

      await page.getByRole('button', { name: '新規作成' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // シードの 2026-001 と重複させる
      await dialog.locator('#p-code').fill('2026-001');
      await dialog.locator('#p-name').fill('重複テスト');
      const customerSelect = dialog.locator('#p-customer');
      const firstCustomerValue = await customerSelect
        .locator('option')
        .nth(1)
        .getAttribute('value');
      if (firstCustomerValue) {
        await customerSelect.selectOption(firstCustomerValue);
      }
      await dialog.getByRole('button', { name: '作成' }).click();

      // ダイアログは閉じず、フォーム内に PROJECT_CODE_TAKEN のメッセージ
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('この工事番号は既に登録されています')).toBeVisible({
        timeout: 5_000,
      });
    });
  });
