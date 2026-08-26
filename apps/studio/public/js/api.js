export class ApiError extends Error {
    status;
    payload;
    constructor(message, status, payload) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}
async function decodeResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return await response.json();
        }
        catch {
            return null;
        }
    }
    return response.text();
}
export class StudioApi {
    async request(path, init = {}) {
        const headers = new Headers(init.headers);
        if (init.body !== undefined && !headers.has('Content-Type'))
            headers.set('Content-Type', 'application/json');
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
                ? String(payload.error)
                : `Request failed with HTTP ${response.status}.`;
            throw new ApiError(message, response.status, payload);
        }
        return payload;
    }
    get(path) {
        return this.request(path);
    }
    post(path, body = {}) {
        return this.request(path, { method: 'POST', body: JSON.stringify(body) });
    }
    put(path, body = {}) {
        return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
    }
    patch(path, body = {}) {
        return this.request(path, { method: 'PATCH', body: JSON.stringify(body) });
    }
    delete(path) {
        return this.request(path, { method: 'DELETE' });
    }
    exportUrl(format, parameters = {}) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(parameters)) {
            if (value !== null && value !== undefined && value !== '')
                query.set(key, String(value));
        }
        const suffix = query.size ? `?${query.toString()}` : '';
        return `/api/export/${encodeURIComponent(format)}${suffix}`;
    }
    download(format, parameters = {}) {
        const anchor = document.createElement('a');
        anchor.href = this.exportUrl(format, parameters);
        anchor.download = '';
        anchor.rel = 'noopener';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    }
}
//# sourceMappingURL=api.js.map