import { WORKSPACE_HEADER } from '@app/shared';

/**
 * Browser API client. Keeps the short-lived access token in memory only (never localStorage);
 * the refresh token lives in an httpOnly cookie scoped to /api/auth.
 */

let accessToken: string | null = null;
let workspaceId: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export const session = {
  setToken: (t: string | null) => (accessToken = t),
  setWorkspace: (id: string | null) => (workspaceId = id),
  getWorkspace: () => workspaceId,
  onLost: (cb: () => void) => (onSessionLost = cb),
};

/** One refresh at a time; a just-rotated race (server says "retry") is retried once. */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          accessToken = (await res.json()).accessToken;
          return true;
        }
        if (res.status !== 401) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      accessToken = null;
      return false;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send without the workspace header (auth and workspace-list routes). */
  noWorkspace?: boolean;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return `/api${path}${s ? `?${s}` : ''}`;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (workspaceId && !opts.noWorkspace) headers[WORKSPACE_HEADER] = workspaceId;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, credentials: 'include' });
}

export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(path, opts);
    else onSessionLost?.();
  }
  if (!res.ok) {
    let message = res.statusText;
    let issues;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
      issues = data.issues;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, issues);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRaw(path, opts);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Downloads an authenticated file response (exports) through a temporary object URL. */
export async function download(path: string, query?: RequestOptions['query'], fallbackName = 'export'): Promise<void> {
  const res = await apiRaw(path, { query });
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
