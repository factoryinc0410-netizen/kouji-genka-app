import type { LoginRequest, MeResponse } from '@kgk/schemas';
import { apiFetch } from './client';

export function login(input: LoginRequest): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me', { method: 'GET' });
}
