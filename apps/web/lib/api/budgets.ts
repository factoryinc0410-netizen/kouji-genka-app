import type {
  Budget,
  BudgetItem,
  BudgetItemTreeResponse,
  BudgetResponse,
  CreateBudgetItemRequest,
  CreateBudgetRequest,
  ListBudgetsResponse,
  UpdateBudgetItemRequest,
  UpdateBudgetRequest,
} from '@kgk/schemas';
import { API_BASE_URL, ApiError, apiFetch } from './client';

const root = (projectId: string) => `/projects/${projectId}/budgets`;

// ---- Budget ヘッダ ----
export function listBudgets(projectId: string): Promise<ListBudgetsResponse> {
  return apiFetch<ListBudgetsResponse>(root(projectId));
}

export function getBudget(projectId: string, budgetId: string): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}`);
}

export function createBudget(
  projectId: string,
  input: CreateBudgetRequest,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(root(projectId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBudget(
  projectId: string,
  budgetId: string,
  input: UpdateBudgetRequest,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// ---- BudgetItem ----
export function listBudgetItems(
  projectId: string,
  budgetId: string,
): Promise<BudgetItemTreeResponse> {
  return apiFetch<BudgetItemTreeResponse>(`${root(projectId)}/${budgetId}/items`);
}

export function createBudgetItem(
  projectId: string,
  budgetId: string,
  input: CreateBudgetItemRequest,
): Promise<{ item: BudgetItem }> {
  return apiFetch<{ item: BudgetItem }>(`${root(projectId)}/${budgetId}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBudgetItem(
  projectId: string,
  budgetId: string,
  itemId: string,
  input: UpdateBudgetItemRequest,
): Promise<{ item: BudgetItem }> {
  return apiFetch<{ item: BudgetItem }>(`${root(projectId)}/${budgetId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteBudgetItem(
  projectId: string,
  budgetId: string,
  itemId: string,
  lockVersion: number,
): Promise<void> {
  const qs = new URLSearchParams({ lockVersion: String(lockVersion) });
  return apiFetch<void>(`${root(projectId)}/${budgetId}/items/${itemId}?${qs}`, {
    method: 'DELETE',
  });
}

// ---- T26: Workflow (申請 / 承認 / 差戻し / 改定) ----

/** 申請: draft → pending_approval */
export function submitBudget(
  projectId: string,
  budgetId: string,
  lockVersion: number,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ lockVersion }),
  });
}

/** 承認: pending_approval → approved (admin 限定) */
export function approveBudget(
  projectId: string,
  budgetId: string,
  lockVersion: number,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ lockVersion }),
  });
}

/** 差戻し: pending_approval → draft (admin 限定、コメント任意) */
export function rejectBudget(
  projectId: string,
  budgetId: string,
  lockVersion: number,
  comment?: string,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ lockVersion, comment }),
  });
}

/**
 * 改定: approved → superseded + 新 draft (v+1)。
 * レスポンスは **新 draft** budget。呼び出し元はこの id に切替表示すること。
 */
export function reviseBudget(
  projectId: string,
  budgetId: string,
  lockVersion: number,
): Promise<BudgetResponse> {
  return apiFetch<BudgetResponse>(`${root(projectId)}/${budgetId}/revise`, {
    method: 'POST',
    body: JSON.stringify({ lockVersion }),
  });
}

// ---- T27: Excel エクスポート ----

/**
 * 予算の Excel ファイル (xlsx) をダウンロード用に取得。
 *
 * - apiFetch は JSON 前提のため、ここでは素 fetch を使う
 * - filename はサーバの Content-Disposition から RFC 5987 (filename*=UTF-8'') 優先で抽出
 * - エラー時は ApiError を投げる (UI 側でトースト)
 */
export async function exportBudget(
  projectId: string,
  budgetId: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE_URL}${root(projectId)}/${budgetId}/export`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    let code = 'EXPORT_FAILED';
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      code = body.code ?? code;
      message = body.message ?? message;
    } catch {
      // JSON parse 失敗は HTTP テキストでフォールバック
    }
    throw new ApiError(res.status, code, message);
  }
  const blob = await res.blob();
  const filename = parseFilename(res.headers.get('content-disposition'));
  return { blob, filename };
}

/**
 * Content-Disposition ヘッダから filename を抽出。
 * RFC 5987 (filename*=UTF-8''xxx) を優先し、なければ ASCII filename= を使用。
 * パース失敗時は budget.xlsx をフォールバック。
 */
function parseFilename(header: string | null): string {
  if (!header) return 'budget.xlsx';
  // filename*=UTF-8''<encoded>
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // フォールスルー
    }
  }
  // filename="..."
  const ascii = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return ascii?.[1] ?? 'budget.xlsx';
}

export type { Budget };
