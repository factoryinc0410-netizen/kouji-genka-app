import type {
  CreateUserRequest,
  ListUsersQuery,
  ListUsersResponse,
  UserResponse,
} from '@kgk/schemas';
import { apiFetch } from './client';

export function listUsers(query: Partial<ListUsersQuery> = {}): Promise<ListUsersResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  const qs = params.toString();
  return apiFetch<ListUsersResponse>(`/users${qs ? `?${qs}` : ''}`);
}

export function createUser(input: CreateUserRequest): Promise<UserResponse> {
  return apiFetch<UserResponse>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}`, { method: 'DELETE' });
}
