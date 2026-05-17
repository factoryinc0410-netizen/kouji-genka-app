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
 * 予算操作 (commit / delete) の完全完了を待つ。
 *
 * BudgetTreeTable は data-busy="true|false" 属性を露出している。
 * handlePatch 内で setBusy(true) → await PATCH → await onRefresh() → setBusy(false)
 * という流れになっており、setBusy(false) の React commit が起きた時点で
 * 直前の setItems 等の state 更新も commit 済 (React は順序保証)。
 *
 * よって data-busy が **true → false に遷移する** のを待てば、cell の
 * row.original が最新 lockVersion で再レンダされていることが保証される。
 */
async function waitBudgetIdle(page: Page): Promise<void> {
  const tableSel = '[data-testid="budget-table"]';
  // busy=true を先に検知 (commit 中の証拠)。一瞬で抜けるなら catch して continue。
  await page
    .locator(`${tableSel}[data-busy="true"]`)
    .waitFor({ state: 'attached', timeout: 2_000 })
    .catch(() => {});
  // busy=false になるのを待つ → setBusy(false) commit 済 = 先行 state 更新も commit 済
  await page
    .locator(`${tableSel}[data-busy="false"]`)
    .waitFor({ state: 'attached', timeout: 10_000 });
}

/**
 * T26 workflow テスト用の DB 直接リセット。
 *
 * superseded → draft の遷移は API では存在しない (業務上は不可逆) ため、
 * テスト後始末では docker exec で psql を叩いて 1) v2 以降をハード削除、
 * 2) v1 を draft に戻す、を行う。container_name は infra/docker-compose.yml
 * で `kgk-postgres` に pin 済 (CI/local 共通)。
 */
function resetBudgetToSeed(projectCode: string): void {
  // 1) 当該 project に紐づく全 budget の audit_logs を削除 (T33: 履歴 timeline を冪等化)
  //    entity_id は VARCHAR(100)、budget.id は UUID なので ::text にキャストして比較
  // 2) v2 以降の budget_items と budget をハード削除
  // 3) v1 を draft (lock_version+1) に戻す
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

    test('行アクションメニューで「子要素として追加」→「削除」', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);

      // 初期 totalAmount を覚えておく (= 2,237,100)
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // --- composite 「1-1 (土工事)」の行のアクションメニュー → 子要素として追加 ---
      const compositeRow = page.locator('tr', { hasText: '土工事' }).first();
      await compositeRow.getByRole('button', { name: '行アクション' }).click();
      await page.getByRole('menuitem', { name: '子要素として追加' }).click();

      // 「新規明細」行が追加される (デフォルト quantity=0 / unitPrice=0 で amount=0)
      const newRow = page.locator('tr', { hasText: '新規明細' }).last();
      await expect(newRow).toBeVisible({ timeout: 10_000 });
      // 親の集計 (composite 1-1 / section 1 / totalAmount) は不変 (追加行が amount=0 のため)
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 5_000 });

      // --- 数量と単価を入れて amount=1,000 → ロールアップで totalAmount が +1,000 ---
      const newQty = newRow.locator('input').nth(0);
      await newQty.click();
      await newQty.fill('10');
      await newQty.blur();
      await waitBudgetIdle(page);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 5_000 }); // 単価 0 なので 0

      // 再度 row を取り直す (refetch 後の React 要素)
      const newRow2 = page.locator('tr', { hasText: '新規明細' }).last();
      const newPrice = newRow2.locator('input').nth(1);
      await newPrice.click();
      await newPrice.fill('100');
      await newPrice.blur();
      await waitBudgetIdle(page);
      // 10 * 100 = 1,000 が加算
      await expect(page.getByText('2,238,100 円')).toBeVisible({ timeout: 10_000 });

      // --- 削除メニュー → 確認ダイアログ accept ---
      page.on('dialog', (d) => d.accept());
      const targetRow = page.locator('tr', { hasText: '新規明細' }).last();
      await targetRow.getByRole('button', { name: '行アクション' }).click();
      await page.getByRole('menuitem', { name: '削除' }).click();

      // 元の合計に復元
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('tr', { hasText: '新規明細' })).toHaveCount(0);
    });

    test('インライン編集 (name) と編集ダイアログでまとめ更新', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      const d111Row = page.locator('tr', { hasText: '1-1-1' });

      // --- インライン編集: name = "掘削" → "掘削(改)" ---
      // 通常表示は <button aria-label="名称">、クリックで <input aria-label="名称"> に切替
      const nameBtn = d111Row.locator('button[aria-label="名称"]');
      await expect(nameBtn).toContainText('掘削');
      await nameBtn.click();
      const nameInput = d111Row.locator('input[aria-label="名称"]');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill('掘削(改)');
      await nameInput.press('Enter');
      await waitBudgetIdle(page);

      // 再表示された button に新しい値が反映
      await expect(d111Row.locator('button[aria-label="名称"]')).toContainText('掘削(改)', {
        timeout: 5_000,
      });
      // 金額は変わらないことを確認 (文字列フィールド変更で rollUp スキップ最適化)
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 5_000 });

      // --- 編集ダイアログでまとめ更新: unit 'm3' → 'm³'、unitPrice 1200 → 1500 ---
      await d111Row.getByRole('button', { name: '行アクション' }).click();
      await page.getByRole('menuitem', { name: '編集' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // ダイアログ内の初期値が正しいことを確認
      await expect(dialog.locator('#b-name')).toHaveValue('掘削(改)');
      await expect(dialog.locator('#b-unit')).toHaveValue('m3');
      await expect(dialog.locator('#b-price')).toHaveValue('1200');

      // 初期 notes は空
      await expect(dialog.locator('#b-notes')).toHaveValue('');

      // 単位 → m³、単価 → 1500、備考 → メモを設定
      await dialog.locator('#b-unit').fill('m³');
      await dialog.locator('#b-price').fill('1500');
      await dialog.locator('#b-notes').fill('E2E 動作確認用メモ');
      await dialog.getByRole('button', { name: '保存' }).click();
      await expect(dialog).toBeHidden({ timeout: 5_000 });
      await waitBudgetIdle(page);

      // ロールアップ反映: 120.5 * 1500 = 180,750
      // 元の d111 amount=144,600 → +36,150 → totalAmount=2,273,250
      await expect(page.getByText('2,273,250 円')).toBeVisible({ timeout: 10_000 });
      // 単位カラムにも m³ が反映
      await expect(d111Row.locator('button[aria-label="単位"]')).toContainText('m³');

      // notes が永続化されたことをダイアログ再オープンで確認
      await d111Row.getByRole('button', { name: '行アクション' }).click();
      await page.getByRole('menuitem', { name: '編集' }).click();
      const dialog2 = page.getByRole('dialog');
      await expect(dialog2).toBeVisible({ timeout: 5_000 });
      await expect(dialog2.locator('#b-notes')).toHaveValue('E2E 動作確認用メモ');
      await dialog2.getByRole('button', { name: 'キャンセル' }).click();
      await expect(dialog2).toBeHidden({ timeout: 5_000 });

      // --- 後始末: API 直叩きで seed 値に戻す ---
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
        {
          data: {
            lockVersion: d111.lockVersion,
            name: '掘削',
            unit: 'm3',
            unitPrice: '1200',
            notes: null,
          },
        },
      );
      expect(revertRes.ok()).toBeTruthy();
    });

    test('予算ヘッダ: タイトル inline + 備考 dialog の編集 (T30)', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // --- インライン編集: 予算タイトル ---
      // 初期値は seed の "初期予算 (v1)"
      const titleBtn = page.locator('button[aria-label="予算タイトル"]');
      await expect(titleBtn).toContainText('初期予算 (v1)');
      await titleBtn.click();
      const titleInput = page.locator('input[aria-label="予算タイトル"]');
      await titleInput.waitFor({ state: 'visible' });
      await titleInput.fill('v1 (E2E 編集テスト)');
      await titleInput.press('Enter');
      // EditableText の input は commit 完了で消える (再レンダで button に戻る)
      await titleInput.waitFor({ state: 'detached', timeout: 5_000 });
      await expect(page.locator('button[aria-label="予算タイトル"]')).toContainText(
        'v1 (E2E 編集テスト)',
        { timeout: 5_000 },
      );

      // --- 備考編集ダイアログ ---
      await page.getByRole('button', { name: '備考を編集' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // タイトル欄に最新値が入っていることを確認 (ダイアログでも編集できる)
      await expect(dialog.locator('#bh-title')).toHaveValue('v1 (E2E 編集テスト)');
      // notes はシード値が入っている (seed.ts: '...サンプルの内訳ツリー...')
      await expect(dialog.locator('#bh-notes')).toHaveValue(/サンプルの内訳ツリー/);
      // 複数行の notes に上書き
      await dialog.locator('#bh-notes').fill('E2E:\n- 監督指示 #42\n- 仮設費を後から精算');
      await dialog.getByRole('button', { name: '保存' }).click();
      await expect(dialog).toBeHidden({ timeout: 5_000 });

      // notes プレビューが新しい内容に更新される
      const preview = page.locator('[data-testid="budget-notes-preview"]');
      await expect(preview).toBeVisible({ timeout: 5_000 });
      await expect(preview).toContainText('監督指示 #42');

      // --- 後始末: API 直叩きで title/notes を seed 値に戻す ---
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
      ).json()) as { items: Array<{ id: string; lockVersion: number }> };
      const budget = budgets.items[0];
      if (!budget) throw new Error('seed budget missing');
      const revertRes = await req.patch(`${API_BASE}/projects/${project.id}/budgets/${budget.id}`, {
        data: {
          lockVersion: budget.lockVersion,
          title: '初期予算 (v1)',
          notes: 'シードデータ: サンプルの内訳ツリー (土工事 / 鉄筋 / 共通仮設費)',
        },
      });
      expect(revertRes.ok()).toBeTruthy();
    });

    test('予算ワークフロー: 申請 → 承認 → 改定 → 新版表示 (T26)', async ({ page }) => {
      page.on('dialog', (d) => d.accept()); // 申請/承認/改定 すべての confirm を受諾

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // 初期 draft: 「申請する」+「+ 科目を追加」が表示されている
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible();
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toBeVisible();

      // --- 申請 ---
      await page.getByRole('button', { name: '申請する' }).click();
      // pending_approval に遷移 → 「承認する」「差戻す」が出る
      await expect(page.getByRole('button', { name: '承認する' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('button', { name: '差戻す' })).toBeVisible();
      // 編集は無効化される (status≠draft なので「+ 科目を追加」非表示)
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);

      // --- 承認 ---
      await page.getByRole('button', { name: '承認する' }).click();
      // approved → 「改定して新版を作成」が出る
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toBeVisible({
        timeout: 10_000,
      });
      // 承認後も編集系は無効
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);

      // --- 改定 ---
      await page.getByRole('button', { name: '改定して新版を作成' }).click();
      // 新 draft (v2) に切替 → 「申請する」が再び出現
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible({
        timeout: 15_000,
      });
      // 「改定して新版を作成」は消える (新版は draft なので)
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toHaveCount(0);
      // version 切替ボタン群に v1 (superseded) と v2 (draft) が並ぶ
      await expect(page.getByRole('button', { name: /v1.*superseded/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /v2.*draft/ })).toBeVisible();
      // totalAmount は v1 と同じ (items コピー成功)
      await expect(page.getByText('2,237,100 円')).toBeVisible();
      // 編集系 (「+ 科目を追加」) も復活
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toBeVisible();

      // --- 旧版 (v1, superseded) を表示 → 読取専用 ---
      await page.getByRole('button', { name: /v1.*superseded/ }).click();
      // ワークフロー操作も編集操作も出ない
      await expect(page.getByRole('button', { name: '申請する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);

      // --- 後始末: v2 をハード削除、v1 を draft に戻す ---
      resetBudgetToSeed('2026-001');
    });

    test('予算ワークフロー: 申請 → 差戻し → draft 復帰 (T26)', async ({ page }) => {
      page.on('dialog', (d) => d.accept());

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // 初期 draft
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible();

      // --- 申請 ---
      await page.getByRole('button', { name: '申請する' }).click();
      await expect(page.getByRole('button', { name: '差戻す' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toHaveCount(0);

      // --- 差戻し: ダイアログでコメント入力 → 保存 ---
      await page.getByRole('button', { name: '差戻す' }).click();
      const rejectDialog = page.getByRole('dialog');
      await expect(rejectDialog).toBeVisible({ timeout: 5_000 });
      await rejectDialog
        .locator('#br-comment')
        .fill('単価の根拠資料を添付してから再申請してください');
      await rejectDialog.getByRole('button', { name: '差戻す' }).click();
      await expect(rejectDialog).toBeHidden({ timeout: 5_000 });

      // draft に戻り、「申請する」「+ 科目を追加」が復活
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: '+ 科目を追加' })).toBeVisible();

      // --- 後始末: lockVersion bump 分も含めて draft seed 値に戻す ---
      resetBudgetToSeed('2026-001');
    });

    test('予算 Excel 出力: ボタンから xlsx ダウンロード (T27)', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // ボタンが常時表示 (status=draft でも、その他でも)
      const exportBtn = page.getByRole('button', { name: 'Excel 出力' });
      await expect(exportBtn).toBeVisible();

      // ダウンロードイベントを待ち受けてからクリック
      const [download] = await Promise.all([page.waitForEvent('download'), exportBtn.click()]);

      // ファイル名: 「予算内訳書_初期予算 (v1)_v1.xlsx」
      expect(download.suggestedFilename()).toBe('予算内訳書_初期予算 (v1)_v1.xlsx');

      // 実ファイルが空でない (Excel ファイルなら最低数 KB ある)
      const fs = await import('node:fs/promises');
      const path = await download.path();
      const stat = await fs.stat(path);
      expect(stat.size).toBeGreaterThan(1000);
    });

    test('予算ワークフロー履歴: 申請 → 承認 後に timeline に並ぶ (T33)', async ({ page }) => {
      // テスト境界を整える: 過去テストで蓄積した audit_logs もクリア
      resetBudgetToSeed('2026-001');
      page.on('dialog', (d) => d.accept());

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // --- 申請 → 承認 ---
      await page.getByRole('button', { name: '申請する' }).click();
      await expect(page.getByRole('button', { name: '承認する' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: '承認する' }).click();
      await expect(page.getByRole('button', { name: '改定して新版を作成' })).toBeVisible({
        timeout: 10_000,
      });

      // --- 履歴ボタンで drawer を開く ---
      await page.getByTestId('budget-history-button').click();
      const drawer = page.getByTestId('budget-history-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });

      // timeline に submit と approve が並ぶ (create は seed 投入で audit が無い場合もあるので
      // 必ず存在する 2 件のみ assert)
      const submitRow = drawer.locator('[data-event-type="submit"]');
      const approveRow = drawer.locator('[data-event-type="approve"]');
      await expect(submitRow).toHaveCount(1);
      await expect(approveRow).toHaveCount(1);

      // 実行者名 (admin の name) が表示されている
      await expect(submitRow).toContainText('が ');
      await expect(approveRow).toContainText('が ');

      // Esc で drawer が閉じる
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden({ timeout: 5_000 });

      // --- 後始末: pending/approved を draft に戻す ---
      resetBudgetToSeed('2026-001');
    });

    test('予算ワークフロー履歴: 差戻し理由がタイムラインに表示される (T33)', async ({ page }) => {
      resetBudgetToSeed('2026-001');
      page.on('dialog', (d) => d.accept());
      const REJECT_COMMENT = '単価の根拠資料を添付してから再申請してください';

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.getByRole('link', { name: '工事管理' }).click();
      await page.locator('tr', { hasText: '2026-001' }).getByRole('link', { name: '詳細' }).click();
      await page.getByRole('link', { name: '実行予算を開く →' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+\/budget$/);
      await expect(page.getByText('2,237,100 円')).toBeVisible({ timeout: 10_000 });

      // --- 申請 → 差戻し (コメント付) ---
      await page.getByRole('button', { name: '申請する' }).click();
      await expect(page.getByRole('button', { name: '差戻す' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: '差戻す' }).click();
      const rejectDialog = page.getByRole('dialog');
      await expect(rejectDialog).toBeVisible({ timeout: 5_000 });
      await rejectDialog.locator('#br-comment').fill(REJECT_COMMENT);
      await rejectDialog.getByRole('button', { name: '差戻す' }).click();
      await expect(rejectDialog).toBeHidden({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: '申請する' })).toBeVisible({ timeout: 10_000 });

      // --- 履歴 drawer を開いて reject 行に reason が見えること ---
      await page.getByTestId('budget-history-button').click();
      const drawer = page.getByTestId('budget-history-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      const rejectRow = drawer.locator('[data-event-type="reject"]');
      await expect(rejectRow).toHaveCount(1);
      await expect(rejectRow.getByTestId('budget-history-reason')).toHaveText(REJECT_COMMENT);

      // --- 後始末 ---
      resetBudgetToSeed('2026-001');
    });
  });
