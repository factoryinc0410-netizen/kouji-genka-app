import type {
  GrantProjectPermissionRequest,
  ListProjectPermissionsResponse,
  ProjectPermissionResponse,
  UpdateProjectPermissionRequest,
} from '@kgk/schemas';
import { apiFetch } from './client';

export function listProjectPermissions(projectId: string): Promise<ListProjectPermissionsResponse> {
  return apiFetch<ListProjectPermissionsResponse>(`/projects/${projectId}/permissions`);
}

export function grantProjectPermission(
  projectId: string,
  input: GrantProjectPermissionRequest,
): Promise<ProjectPermissionResponse> {
  return apiFetch<ProjectPermissionResponse>(`/projects/${projectId}/permissions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProjectPermission(
  projectId: string,
  userId: string,
  input: UpdateProjectPermissionRequest,
): Promise<ProjectPermissionResponse> {
  return apiFetch<ProjectPermissionResponse>(`/projects/${projectId}/permissions/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function revokeProjectPermission(projectId: string, userId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}/permissions/${userId}`, { method: 'DELETE' });
}
