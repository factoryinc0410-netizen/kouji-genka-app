import type { ListCustomersQuery, ListCustomersResponse } from '@kgk/schemas';
import { apiFetch } from './client';

export function listCustomers(
  query: Partial<ListCustomersQuery> = {},
): Promise<ListCustomersResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.customerType) params.set('customerType', query.customerType);
  const qs = params.toString();
  return apiFetch<ListCustomersResponse>(`/customers${qs ? `?${qs}` : ''}`);
}
