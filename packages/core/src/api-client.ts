/**
 * SALON shared API client (spec §6.3).
 * - CSRF token from GET /auth/csrf, echoed in X-CSRF-Token on mutations
 * - X-Request-ID on every request
 * - Single-flight refresh with a queue of waiting requests
 * - ApiError carrying machine-readable code from @salon/core ErrorCode
 */
// NOTE: sibling module of @salon/core — import types relatively, not by package name.
import type { ApiResponse, PaginationMeta } from './index';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string; // e.g. https://api.salon.ru/v1 or /v1 (proxied in dev)
  credentials?: 'include' | 'same-origin' | 'omit'; // default 'include'
}

type QueueItem = { resolve: (v: string | null) => void };

export function createApiClient(opts: ApiClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, '');
  let csrfToken: string | null = null;
  let csrfPromise: Promise<string | null> | null = null;
  let refreshing: Promise<boolean> | null = null;
  const waiters: QueueItem[] = [];

  function rid(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function fetchCsrf(): Promise<string | null> {
    if (!csrfPromise) {
      csrfPromise = raw<{ csrfToken: string }>('/auth/csrf', { method: 'GET' })
        .then((d) => {
          csrfToken = d.csrfToken;
          return csrfToken;
        })
        .catch(() => {
          csrfPromise = null;
          return null;
        });
    }
    return csrfPromise;
  }

  /** Low-level fetch that unwraps the { success, data } envelope. */
  async function raw<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', rid());
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      if (csrfToken == null) await fetchCsrf();
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    }

    const res = await fetch(`${base}${path}`, {
      credentials: opts.credentials ?? 'include',
      ...init,
      headers,
    });

    if (res.status === 401 && retryOn401) {
      const okRefresh = await refreshOnce();
      if (okRefresh) return raw<T>(path, init, false);
    }

    let body: ApiResponse<T>;
    try {
      body = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError('INTERNAL', `Сервер вернул некорректный ответ (${res.status})`, res.status);
    }

    if (!body.success) {
      throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
    }
    return body.data;
  }

  /** Single-flight refresh: concurrent 401s share one refresh call. */
  function refreshOnce(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await fetch(`${base}/auth/refresh`, {
          method: 'POST',
          credentials: opts.credentials ?? 'include',
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': rid(), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
          body: JSON.stringify({ refreshToken: '' }), // cookie fallback handled server-side; value kept for DTO shape
        });
        // The backend rotates via cookie OR body; if body-based fails we still may have cookie session
        if (!r.ok) {
          // retry once relying purely on httpOnly refresh cookie
          const r2 = await fetch(`${base}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': rid(), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
            body: JSON.stringify({}),
          }).catch(() => null);
          if (!r2 || !r2.ok) return false;
        }
        // re-read csrf after rotation
        await fetchCsrf();
        waiters.forEach((w) => w.resolve(csrfToken));
        waiters.length = 0;
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    return raw<T>(path, init ?? {});
  }

  api.withMeta = async <T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PaginationMeta }> => {
    const headers = new Headers(init?.headers);
    headers.set('X-Request-ID', rid());
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      if (csrfToken == null) await fetchCsrf();
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    }
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${base}${path}`, { credentials: opts.credentials ?? 'include', ...init, headers });
    const body = (await res.json()) as ApiResponse<T>;
    if (!body.success) throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
    return { data: body.data, meta: body.meta };
  };

  api.get = <T>(path: string) => api<T>(path);
  api.post = <T>(path: string, data?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
  api.patch = <T>(path: string, data?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) });
  api.put = <T>(path: string, data?: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) });
  api.del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
  api.ensureCsrf = fetchCsrf;

  return api;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
