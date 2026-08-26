export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: unknown;

  public constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function decodeResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return response.text();
}

export class StudioApi {
  public async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    const response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await decodeResponse(response);
    if (!response.ok) {
      const message = typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}.`;
      throw new ApiError(message, response.status, payload);
    }
    return payload as T;
  }

  public get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  public post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  public put<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  public patch<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  public delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  public exportUrl(format: string, parameters: Record<string, string | number | boolean | null | undefined> = {}): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
    }
    const suffix = query.size ? `?${query.toString()}` : '';
    return `/api/export/${encodeURIComponent(format)}${suffix}`;
  }

  public download(format: string, parameters: Record<string, string | number | boolean | null | undefined> = {}): void {
    const anchor = document.createElement('a');
    anchor.href = this.exportUrl(format, parameters);
    anchor.download = '';
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }
}
