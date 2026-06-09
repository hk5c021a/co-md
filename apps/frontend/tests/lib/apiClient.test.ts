import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock is hoisted — the factory must only reference hoisted variables.
const { mockAccessToken, mockGetAccessToken, mockClearAll } = vi.hoisted(() => ({
  mockAccessToken: { current: null as string | null },
  mockGetAccessToken: vi.fn(),
  mockClearAll: vi.fn(),
}));

vi.mock('../../src/lib/tokenStore', () => ({
  tokenStore: {
    get accessToken() { return mockAccessToken.current; },
    set accessToken(v: string | null) { mockAccessToken.current = v; },
    getAccessToken: mockGetAccessToken,
    clearAll: mockClearAll,
  },
}));

import { apiFetch } from '../../src/lib/apiClient';

// Capture dispatched events
const capturedEvents: Array<{ type: string; detail?: unknown }> = [];

function captureEvent(e: Event) {
  capturedEvents.push({
    type: e.type,
    detail: (e as CustomEvent).detail,
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
    mockAccessToken.current = null;
    mockGetAccessToken.mockResolvedValue(null);
    mockClearAll.mockResolvedValue(undefined);
    sessionStorage.clear();
    window.addEventListener('auth:session-expired', captureEvent);
    window.addEventListener('token-refreshed', captureEvent);
  });

  afterEach(() => {
    window.removeEventListener('auth:session-expired', captureEvent);
    window.removeEventListener('token-refreshed', captureEvent);
  });

  // ── Normal requests ──

  it('makes a successful GET request and returns the response', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const res = await apiFetch('/api/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true });
  });

  it('passes custom headers through', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await apiFetch('/api/test', { headers: { 'X-Custom': 'value' } });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('value');
  });

  it('injects Authorization header when access token is set', async () => {
    mockAccessToken.current = 'test-access-token';
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await apiFetch('/api/protected');

    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-access-token');
  });

  it('does not inject Authorization header when no token', async () => {
    mockAccessToken.current = null;
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await apiFetch('/api/public');

    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sets Content-Type to application/json by default', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await apiFetch('/api/data');

    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does not override Content-Type for FormData body', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);
    const formData = new FormData();
    formData.append('file', new Blob(['test']), 'test.txt');

    await apiFetch('/api/upload', { method: 'POST', body: formData });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  // ── Error responses (non-401) ──

  it('passes through non-401 error responses', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const res = await apiFetch('/api/bad');
    expect(res.status).toBe(400);
  });

  it('passes through 500 error responses', async () => {
    const mockResponse = new Response('Server error', { status: 500 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const res = await apiFetch('/api/error');
    expect(res.status).toBe(500);
  });

  // ── 401 handling ──

  it('clears session on 401 when no refresh token available', async () => {
    mockAccessToken.current = null;
    mockGetAccessToken.mockResolvedValue(null);
    const mockResponse = new Response('Unauthorized', { status: 401 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await expect(apiFetch('/api/secure')).rejects.toThrow('Session expired');
    expect(mockClearAll).toHaveBeenCalled();
    expect(capturedEvents.some((e) => e.type === 'auth:session-expired')).toBe(true);
  });

  it('retries with refreshed token on 401', async () => {
    mockAccessToken.current = 'old-expired-token';
    mockGetAccessToken.mockResolvedValue('new-fresh-token');

    const mock401 = new Response('Unauthorized', { status: 401 });
    const mock200 = new Response(JSON.stringify({ success: true }), { status: 200 });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mock401)
      .mockResolvedValueOnce(mock200);

    const res = await apiFetch('/api/secure');
    expect(res.status).toBe(200);
    expect(mockAccessToken.current).toBe('new-fresh-token');
    expect(capturedEvents.some((e) => e.type === 'token-refreshed')).toBe(true);
  });

  it('clears session when retry with refreshed token also fails 401', async () => {
    mockAccessToken.current = 'old-expired-token';
    mockGetAccessToken.mockResolvedValue('new-token');

    const mock401 = new Response('Unauthorized', { status: 401 });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mock401)
      .mockResolvedValueOnce(mock401);

    await expect(apiFetch('/api/secure')).rejects.toThrow('Session expired');
    expect(mockClearAll).toHaveBeenCalled();
    expect(capturedEvents.some((e) => e.type === 'auth:session-expired')).toBe(true);
  });

  it('skips session-expired redirect when co_md_skip_expired flag is set', async () => {
    mockAccessToken.current = 'some-token';
    sessionStorage.setItem('co_md_skip_expired', '1');

    const mock401 = new Response('Unauthorized', { status: 401 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mock401);

    await expect(apiFetch('/api/secure')).rejects.toThrow('Session expired');
    // Flag should be consumed
    expect(sessionStorage.getItem('co_md_skip_expired')).toBeNull();
    // Should NOT have tried to refresh
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  // ── Network errors ──

  it('propagates network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/offline')).rejects.toThrow('Failed to fetch');
  });
});
