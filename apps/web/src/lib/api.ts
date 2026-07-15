import type { Organization } from '@abonten/contracts';

// API client pointing to the API base URL from env (NEXT_PUBLIC_* exposed to the browser).
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function getHealth(): Promise<{ status?: string }> {
  return apiFetch<{ status?: string }>('/health');
}

export async function getOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/api/organizations');
}
