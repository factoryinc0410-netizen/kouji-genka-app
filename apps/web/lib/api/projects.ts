import type {
  CreateProjectRequest,
  ListProjectsQuery,
  ListProjectsResponse,
  ProjectResponse,
  ProjectStatusHistoryResponse,
  UpdateProjectRequest,
} from '@kgk/schemas';
import { apiFetch } from './client';

export function listProjects(
  query: Partial<ListProjectsQuery> = {},
): Promise<ListProjectsResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.projectType) params.set('projectType', query.projectType);
  if (query.constructionType) params.set('constructionType', query.constructionType);
  if (query.customerId) params.set('customerId', query.customerId);
  if (query.managerUserId) params.set('managerUserId', query.managerUserId);
  const qs = params.toString();
  return apiFetch<ListProjectsResponse>(`/projects${qs ? `?${qs}` : ''}`);
}

export function getProject(id: string): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/projects/${id}`);
}

export function createProject(input: CreateProjectRequest): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProject(id: string, input: UpdateProjectRequest): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/projects/${id}`, { method: 'DELETE' });
}

/**
 * T34: 工事ステータス遷移履歴を時系列 (changedAt asc) で取得。
 * GET /projects/:id/status-history (view 権限)
 */
export function getProjectStatusHistory(id: string): Promise<ProjectStatusHistoryResponse> {
  return apiFetch<ProjectStatusHistoryResponse>(`/projects/${id}/status-history`);
}
