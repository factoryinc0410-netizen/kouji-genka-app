import { execSync } from 'node:child_process';
import { expect, type Page, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@kgk.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin_dev_password';

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  const submit = page.locator('form button[type="submit"]:not([disabled])');
  await submit.waitFor({ state: 'visible' });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * 2026-001 seed の budget をシード状態 (v1=draft, audit/履歴クリア) に戻す。
 * 他テストへの影響を防ぐため、本 spec の各テストの冒頭と最終 afterEach で実行。
 */
function resetBudgetToSeed(projectCode: string): void {
  const sql = `
    DELETE FROM audit_logs WHERE entity_type='budgets' AND entity_id IN (
      SELECT b.id::text FROM budgets b
      JOIN projects p ON p.id = b.project_id
      WHERE p.code = '${projectCode}'
    );
    DELETE FROM budget_items WHERE budget_id IN (
      SELECT b.id FROM budgets b
      JOIN projects p ON p.id = b.project_id
      WHERE p.code = '${projectCode}' AND b.version > 1
    );
    DELETE FROM budgets WHERE project_id = (SELECT id FROM projects WHERE code = '${projectCode}') AND version > 1;
    UPDATE budgets
      SET status = 'draft',
          submitted_by_id = NULL,
          submitted_at = NULL,
          approved_by_id = NULL,
          approved_at = NULL,
          lock_version = lock_version + 1
      WHERE project_id = (SELECT id FROM projects WHERE code = '${projectCode}') AND version = 1;
  `.replace(/\s+/g, ' ');
  execSync(`docker exec kgk-postgres psql -U kgk -d kgk -c "${sql}"`, { stdio: 'pipe' });
}

test.describe
  .serial('dashboard (T35)', () => {
    test('シナリオ 1: admin login → /admin/dashboard が表示され、タイトル/5 ステータス/アラート文言が揃う', async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      // ログイン後の自動リダイレクトで /admin/dashboard に到達
      await expect(page).toHaveURL(/\/admin\/dashboard$/);

      // タイトル
      await expect(page.getByRole('heading', { name: '工事原価管制ダッシュボード' })).toBeVisible({
        timeout: 10_000,
      });
      // 5 ステータスカード (data-status で個別検証)
      await expect(
        page.locator('[data-testid="status-count-tile"][data-status="bidding"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="status-count-tile"][data-status="in_progress"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="status-count-tile"][data-status="completed"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="status-count-tile"][data-status="billing"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="status-count-tile"][data-status="closed"]'),
      ).toBeVisible();

      // 承認待ち管制塔カード
      await expect(page.getByTestId('pending-approval-card')).toBeVisible();
      await expect(page.getByTestId('pending-approval-card')).toHaveAttribute(
        'data-audience',
        'admin',
      );

      // カバレッジカード + アラート 5 段階表示
      await expect(page.getByTestId('coverage-card')).toBeVisible();
      const chips = page.locator('[data-testid="coverage-alert-chip"]');
      await expect(chips).toHaveCount(5);
      // 各 alertLevel の chip が並ぶ
      for (const level of ['over', 'warning', 'caution', 'healthy', 'unknown'] as const) {
        await expect(
          page.locator(`[data-testid="coverage-alert-chip"][data-level="${level}"]`),
        ).toBeVisible();
      }
      // 出来高は別実装の注記
      await expect(
        page.getByText(/出来高ベースの実績消化率はフェーズ後半 \(T38\) で別実装されます/),
      ).toBeVisible();
    });

    test('シナリオ 2: 「施工中」カードをクリックで /admin/projects?status=in_progress へ遷移', async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await expect(page).toHaveURL(/\/admin\/dashboard$/);

      await page.locator('[data-testid="status-count-tile"][data-status="in_progress"]').click();
      await expect(page).toHaveURL(/\/admin\/projects\?status=in_progress$/);
      // 工事一覧画面が描画されている (見出しなど)
      await expect(page.getByRole('heading', { name: '工事管理' })).toBeVisible({
        timeout: 10_000,
      });
    });

    test('シナリオ 3: 申請 → ダッシュボードに承認待ちとして出現 → 後始末', async ({ page }) => {
      // ベースラインを揃える
      resetBudgetToSeed('2026-001');
      page.on('dialog', (d) => d.accept());

      try {
        await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
        await expect(page).toHaveURL(/\/admin\/dashboard$/);

        // 申請前: 件数 0
        const totalBefore = await page.getByTestId('pending-total').textContent();
        expect(totalBefore?.trim()).toBe('0');

        // 工事 2026-001 の予算を開いて申請
        await page.getByRole('link', { name: '工事管理' }).click();
        await page
          .locator('tr', { hasText: '2026-001' })
          .getByRole('link', { name: '詳細' })
          .click();
        await page.getByRole('link', { name: '実行予算を開く →' }).click();
        await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget(?:\?.*)?$/);
        await expect(page.getByRole('button', { name: '申請する' })).toBeVisible({
          timeout: 10_000,
        });
        await page.getByRole('button', { name: '申請する' }).click();
        await expect(page.getByRole('button', { name: '承認する' })).toBeVisible({
          timeout: 10_000,
        });

        // ダッシュボードへ戻る
        await page.getByRole('link', { name: 'ダッシュボード' }).click();
        await expect(page).toHaveURL(/\/admin\/dashboard$/);

        // pending リストに当該工事の行が出現
        const pendingItem = page
          .getByTestId('pending-approval-item')
          .filter({ hasText: '2026-001' })
          .first();
        await expect(pendingItem).toBeVisible({ timeout: 10_000 });
        await expect(pendingItem).toContainText('v1');
        // 開くリンクが存在
        await expect(pendingItem.getByTestId('pending-approval-open-link')).toBeVisible();
        // pending 件数 >= 1
        const totalAfter = await page.getByTestId('pending-total').textContent();
        expect(Number.parseInt(totalAfter ?? '0', 10)).toBeGreaterThanOrEqual(1);
      } finally {
        // 後始末は必ず実行 (失敗時の状態残留を防ぐ)
        resetBudgetToSeed('2026-001');
      }
    });
  });
