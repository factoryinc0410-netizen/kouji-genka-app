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
import { apiFetch } from './client';

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

export type { Budget };
