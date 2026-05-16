import type {
  CreateCustomerRequest,
  CustomerResponse,
  ListCustomersQuery,
  ListCustomersResponse,
  UpdateCustomerRequest,
} from '@kgk/schemas';
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

export function getCustomer(id: string): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`);
}

export function createCustomer(input: CreateCustomerRequest): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCustomer(
  id: string,
  input: UpdateCustomerRequest,
): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteCustomer(id: string): Promise<void> {
  return apiFetch<void>(`/customers/${id}`, { method: 'DELETE' });
}
