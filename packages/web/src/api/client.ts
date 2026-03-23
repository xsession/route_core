const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Harness API
export const harnessApi = {
  list: () => request<any[]>('/harnesses'),
  get: (id: string) => request<any>(`/harnesses/${encodeURIComponent(id)}`),
  create: (data: any) => request<any>('/harnesses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/harnesses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/harnesses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// Parts API
export const partsApi = {
  list: (params?: { category?: string; manufacturer?: string; q?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.manufacturer) searchParams.set('manufacturer', params.manufacturer);
    if (params?.q) searchParams.set('q', params.q);
    const qs = searchParams.toString();
    return request<any[]>(`/parts${qs ? '?' + qs : ''}`);
  },
  get: (id: string) => request<any>(`/parts/${encodeURIComponent(id)}`),
  create: (data: any) => request<any>('/parts', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/parts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  manufacturers: () => request<string[]>('/parts/meta/manufacturers'),
  categories: () => request<string[]>('/parts/meta/categories'),
};

// Cables API
export const cablesApi = {
  list: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<any[]>(`/cables${qs}`);
  },
  get: (id: string) => request<any>(`/cables/${encodeURIComponent(id)}`),
  create: (data: any) => request<any>('/cables', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/cables/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// Export API
export const exportApi = {
  validate: (harness: any) => request<any>('/export/validate', { method: 'POST', body: JSON.stringify(harness) }),
  bom: (harness: any) => request<any>('/export/bom', { method: 'POST', body: JSON.stringify(harness) }),
};
