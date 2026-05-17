import { execSync } from 'node:child_process';
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

/**
 * T34: 工事ステータスを seed 状態 (in_progress) に戻し、project_status_history と
 * 関連 audit を削除するクリーンアップ。
 *
 * 業務的に「実際の本番」では status_history は append-only だが、E2E のローカル DB
 * では繰り返し実行のため都度クリアして冪等性を保つ。container_name は
 * infra/docker-compose.yml で `kgk-postgres` に pin 済。
 */
function resetProjectToSeed(projectCode: string): void {
  const sql = `
    UPDATE projects SET status='in_progress'
      WHERE code='${projectCode}';
    DELETE FROM project_status_history
      WHERE project_id=(SELECT id FROM projects WHERE code='${projectCode}');
    DELETE FROM audit_logs
      WHERE entity_type='projects'
        AND entity_id=(SELECT id::text FROM projects WHERE code='${projectCode}');
  `.replace(/\s+/g, ' ');
  execSync(`docker exec kgk-postgres psql -U kgk -d kgk -c "${sql}"`, { stdio: 'pipe' });
}

/** 工事詳細ページに到達するまでの導線 */
async function gotoProjectDetail(page: Page, projectCode: string): Promise<void> {
  await page.getByRole('link', { name: '工事管理' }).click();
  await page.locator('tr', { hasText: projectCode }).getByRole('link', { name: '詳細' }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+$/);
}

/** 工事 ID を URL から抽出 */
function projectIdFromUrl(page: Page): string {
  const m = new URL(page.url()).pathname.match(/\/admin\/projects\/([0-9a-f-]+)/);
  if (!m?.[1]) throw new Error(`project id not in URL: ${page.url()}`);
  return m[1];
}

/** 遷移 dialog 経由でステータスを進める */
async function advanceStatus(
  page: Page,
  toStatus: 'completed' | 'billing' | 'closed' | 'in_progress',
  reason?: string,
): Promise<void> {
  await page.locator(`[data-testid="project-status-forward-btn"][data-to="${toStatus}"]`).click();
  const dialog = page.getByTestId('project-status-transition-dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  if (reason) {
    await dialog.getByTestId('project-status-reason').fill(reason);
  }
  await dialog.getByTestId('project-status-confirm').click();
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

test.describe
  .serial('project status workflow (T34)', () => {
    test.afterEach(() => {
      // 各テスト失敗時もシード状態に戻す
      resetProjectToSeed('2026-001');
    });

    test('in_progress → completed: badge 切替 / 予算ページに編集ロックバナー / 編集ボタン消失 / API も拒否', async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await gotoProjectDetail(page, '2026-001');
      const projectId = projectIdFromUrl(page);

      // 初期 in_progress
      await expect(page.getByTestId('project-status-badge').first()).toHaveAttribute(
        'data-status',
        'in_progress',
      );

      // --- 「竣工としてマーク」で completed へ ---
      await advanceStatus(page, 'completed', '社内検収完了');
      // badge が切り替わる (ヘッダ部 + 基本情報 dl の 2 か所)
      await expect(page.getByTestId('project-status-badge').first()).toHaveAttribute(
        'data-status',
        'completed',
      );

      // --- 予算ページへ移動 → ロックバナー + 編集系の非活性化を確認 ---
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget(?:\?.*)?$/);
      // ロックバナー
      const banner = page.getByTestId('budget-locked-banner');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      await expect(banner).toContainText('完工');
      await expect(banner).toContainText('申請/承認/差戻しは引き続き可能');
      // 編集系ボタンは消える
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);
      // completed でも申請ボタンは出る (workflow OK)。draft なら「申請する」
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible();
      // 改定ボタンは出ない (revise マトリクスで bidding/in_progress のみ)
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toHaveCount(0);

      // --- API 直叩きでも PROJECT_NOT_EDITABLE で拒否されることを確認 ---
      const req = page.request;
      // セッション認証は cookie で継承される (login 済の page.request を使う)
      const budgetsRes = await req.get(`${API_BASE}/projects/${projectId}/budgets`);
      const budgets = (await budgetsRes.json()) as { items: Array<{ id: string }> };
      const budgetId = budgets.items[0]?.id;
      expect(budgetId).toBeTruthy();
      const createRes = await req.post(
        `${API_BASE}/projects/${projectId}/budgets/${budgetId}/items`,
        {
          data: { kind: 'detail', name: 'API ガード確認' },
        },
      );
      expect(createRes.status()).toBe(422);
      const errBody = (await createRes.json()) as { code: string };
      expect(errBody.code).toBe('PROJECT_NOT_EDITABLE');
    });

    test('billing に遷移すると workflow ボタン (申請/承認/差戻し) も全て非表示', async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await gotoProjectDetail(page, '2026-001');

      // in_progress → completed → billing (2 段)
      await advanceStatus(page, 'completed', '完工');
      await advanceStatus(page, 'billing', '請求開始');
      await expect(page.getByTestId('project-status-badge').first()).toHaveAttribute(
        'data-status',
        'billing',
      );

      // 予算ページへ → workflow 全停止
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget(?:\?.*)?$/);
      const banner = page.getByTestId('budget-locked-banner');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      await expect(banner).toContainText('請求中');
      await expect(banner).toContainText('申請・承認・差戻し・改定もすべて停止');

      // 申請/承認/差戻し/改定 すべて非表示
      await expect(page.getByRole('button', { name: '申請する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '承認する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '差戻す' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);
    });

    test('履歴 Drawer に from → to / 変更者名 / 理由 が時系列で表示', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await gotoProjectDetail(page, '2026-001');

      await advanceStatus(page, 'completed', '社内検収完了');
      await advanceStatus(page, 'billing', '請求書発行準備中');

      // 履歴ボタン → drawer 開く
      await page.getByTestId('project-status-history-button').click();
      const drawer = page.getByTestId('project-status-history-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      const timeline = drawer.getByTestId('project-status-history-timeline');
      const events = timeline.getByTestId('project-status-history-event');

      // 2 件の遷移が時系列で並ぶ (in_progress→completed, completed→billing)
      await expect(events).toHaveCount(2);
      await expect(events.nth(0)).toHaveAttribute('data-to', 'completed');
      await expect(events.nth(1)).toHaveAttribute('data-to', 'billing');

      // 変更者名 (admin の name = 「管理者」想定。実 seed 値を確認したいので寛容に match)
      await expect(events.nth(0)).toContainText('が変更');
      await expect(events.nth(1)).toContainText('が変更');

      // reason が引用ブロックで表示される
      await expect(events.nth(0).getByTestId('project-status-history-reason')).toHaveText(
        '社内検収完了',
      );
      await expect(events.nth(1).getByTestId('project-status-history-reason')).toHaveText(
        '請求書発行準備中',
      );

      // Esc で閉じる
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden({ timeout: 5_000 });
    });
  });
