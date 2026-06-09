// ── Unified API Client ──
// Dev:  VITE_API_URL=https://localhost:3000  → direct calls to backend
// Prod: VITE_API_URL empty                   → relative paths, same-origin (Caddy proxy)
//
// WebSocket: VITE_WS_URL in dev, fallback to hostname:4000
// Prod WS connects to /ws-server via Caddy, which strips the prefix with handle_path
// before forwarding to ws-server:4000. The WS server must serve on root (/).

import { tokenStore } from './tokenStore';

export const API_BASE: string = import.meta.env.VITE_API_URL || '';

export function getWsBase(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  if (import.meta.env.PROD) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${location.host}/ws-server`;
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.hostname}:4000`;
}

// Bearer token injection + automatic 401 retry via Worker refresh
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  // Only set JSON Content-Type for non-FormData bodies (browser auto-sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const at = tokenStore.accessToken;
  if (at) headers['Authorization'] = `Bearer ${at}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (res.status === 401) {
    // Guard: if the user just changed their password (or another flow set
    // this flag), skip the "session expired" toast and redirect — we're
    // navigating to login intentionally.
    const skipExpired = sessionStorage.getItem('co_md_skip_expired');
    if (skipExpired) {
      sessionStorage.removeItem('co_md_skip_expired');
      throw new Error('Session expired');
    }

    const newAt = await tokenStore.getAccessToken();
    if (newAt) {
      tokenStore.accessToken = newAt;
      headers['Authorization'] = `Bearer ${newAt}`;
      res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      // If retry also fails with 401, clear and redirect (session truly invalid)
      if (res.status === 401) {
        await tokenStore.clearAll();
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
        setTimeout(() => {
          window.location.href = '/login';
        }, 3_000);
        throw new Error('Session expired');
      }
      // Token verified by successful API call — now safe to notify WS connections
      window.dispatchEvent(new CustomEvent('token-refreshed', { detail: newAt }));
    } else {
      await tokenStore.clearAll();
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      setTimeout(() => {
        window.location.href = '/login';
      }, 3_000);
      throw new Error('Session expired');
    }
  }
  return res;
}
