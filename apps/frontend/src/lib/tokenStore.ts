// ── Token Store (main-thread API) ──
// Delegates token storage and refresh to a Web Worker.
// Access tokens are exposed to the main thread (short-lived, 15 min).
// Refresh tokens never leave the Worker.

// Module-level closure for access token — NOT on global scope
let _accessToken: string | null = null;

let worker: Worker | null = null;
let workerSeq = 0; // monotonic sequence — avoids listener starvation on concurrent calls

// Serialise requests through a single queue so only one postAndWait is in-flight
// at a time. This prevents the classic "two listeners, one response" race.
let workerQueue: Promise<void> = Promise.resolve();

function spawnWorker(): Worker {
  const w = new Worker(new URL('./tokenWorker.ts', import.meta.url), { name: 'token-worker', type: 'module' });
  w.onerror = (e) => {
    console.error('[TokenWorker] Worker error:', e.message);
  };
  // Detect untrapped exceptions inside the worker (triggers onerror without message)
  w.onmessageerror = () => {
    console.error('[TokenWorker] Message deserialisation error');
  };
  // ── Unsolicited message listener ──
  // The worker pushes AT_REFRESHED when it proactively renews the AT.
  // This is NOT a request-response pair — it's a spontaneous broadcast.
  // We update the module-level cache so the next apiFetch() uses the new AT.
  //
  // NOTE: do NOT handle RT_MISSING here. RT_MISSING during INIT/GET_AT
  // is handled by postAndWait. RT expiry is caught by the apiClient 401
  // interceptor. Adding auto-redirect here would cause infinite redirect
  // loops because INIT for unauthenticated users naturally returns RT_MISSING.
  let _bc: BroadcastChannel | null = null;
  w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    if (e.data?.type === 'AT_REFRESHED') {
      _accessToken = (e.data as { token: string }).token;
      // Broadcast to other tabs so they update their AT cache too.
      // Use a lazy BroadcastChannel to avoid creating one when not needed.
      try {
        if (!_bc) _bc = new BroadcastChannel('co-md-auth');
        _bc.postMessage({ type: 'token_refreshed', token: _accessToken });
      } catch {
        /* BroadcastChannel unsupported — other tabs refresh independently */
      }
    }
  });
  return w;
}

function getWorker(): Worker {
  if (!worker) {
    worker = spawnWorker();
  }
  return worker;
}

function destroyWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  _initPromise = null; // reset — new worker needs fresh INIT
}

// ── Periodic worker health check ──
// Detects idle worker crashes so the next API call doesn't time out (10s).
let _healthTimer: ReturnType<typeof setInterval> | null = null;

function startHealthCheck(): void {
  if (_healthTimer) return;
  _healthTimer = setInterval(async () => {
    if (!worker) return;
    try {
      const result = await Promise.race([
        postAndWait('PING'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('health timeout')), 2_000)),
      ]);
      if (result.type === undefined) {
        // Unexpected response — worker may be in a bad state
        destroyWorker();
      }
    } catch {
      // Worker unresponsive after 2s — destroy and let next call recreate
      destroyWorker();
    }
  }, 30_000);
}

startHealthCheck();

type WorkerResponse =
  | { type: 'AT_READY'; token: string | null }
  | { type: 'RT_MISSING' }
  | { type: 'STORED' }
  | { type: 'CLEARED' }
  | { type: 'PONG' }
  | { type: 'AT_REFRESHED'; token: string };

const WORKER_TIMEOUT_MS = 10_000; // 10s timeout for Worker responses

function postAndWait(type: string, payload: unknown = {}): Promise<WorkerResponse> {
  const seq = ++workerSeq;
  // Serialise so only one request is in-flight — prevents the race where
  // two concurrent listeners both match the same response type.
  const task = workerQueue.then(
    () =>
      new Promise<WorkerResponse>((resolve, reject) => {
        const w = getWorker();
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          w.removeEventListener('message', handler);
          // Worker may be dead — destroy it so the next call spawns a fresh one
          destroyWorker();
          reject(new Error(`Token worker ${type} request timed out after ${WORKER_TIMEOUT_MS}ms`));
        }, WORKER_TIMEOUT_MS);

        const handler = (e: MessageEvent<WorkerResponse>) => {
          // Ignore unsolicited messages from previous (terminated) worker instances
          if (w !== worker) return;
          // Only accept the exact response type for this request type
          // INIT / GET_AT   → AT_READY | RT_MISSING
          // STORE_RT        → STORED
          // CLEAR           → CLEARED
          const valid =
            (type === 'INIT' || type === 'GET_AT') &&
            (e.data.type === 'AT_READY' || e.data.type === 'RT_MISSING') ||
            (type === 'STORE_RT' && e.data.type === 'STORED') ||
            (type === 'CLEAR' && e.data.type === 'CLEARED') ||
            (type === 'PING' && e.data.type === 'PONG');
          if (!valid) return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          w.removeEventListener('message', handler);
          resolve(e.data);
        };
        w.addEventListener('message', handler);
        w.postMessage({ type, payload });
      })
  );
  // Advance the queue regardless of outcome
  workerQueue = task.then(() => {}, () => {});
  return task;
}

// ── Fingerprint ──

function getOrCreateDeviceId(): string {
  const key = 'co_md_did';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function getFingerprint(): Record<string, unknown> {
  return {
    platform:
      // navigator.userAgentData is the modern replacement for the deprecated navigator.platform
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).userAgentData?.platform || '',
    cores: navigator.hardwareConcurrency || 1,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    deviceId: getOrCreateDeviceId(),
  };
}

// ── Public API ──

let _initPromise: Promise<string | null> | null = null;

export const tokenStore = {
  async init(): Promise<string | null> {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      const fp = getFingerprint();
      const res = await postAndWait('INIT', {
        fingerprint: fp,
      });
      if (res.type === 'AT_READY') return res.token;
      return null;
    })();
    return _initPromise;
  },

  async getAccessToken(): Promise<string | null> {
    const res = await postAndWait('GET_AT');
    if (res.type === 'AT_READY') return res.token;
    return null;
  },

  async storeTokens(
    accessToken: string,
    refreshToken: string,
    keyMaterial?: { passwordHash: string; pbkdf2Salt: string }
  ): Promise<void> {
    await postAndWait('STORE_RT', { accessToken, refreshToken, ...keyMaterial });
  },

  async clearAll(): Promise<void> {
    await postAndWait('CLEAR');
    _accessToken = null; // clear module-level cache immediately
    localStorage.removeItem('co_md_did');
  },

  get accessToken(): string | null {
    return _accessToken;
  },

  set accessToken(t: string | null) {
    _accessToken = t;
  },

  get refreshToken(): string | null {
    // Refresh token is managed by Worker — main thread cannot read it
    return null;
  },

  // Keep for backward compat with existing code that calls these
  clearAccess() {
    this.accessToken = null;
  },
  clearRefresh() {
    // RT is in Worker — no-op from main thread
  },

  // For Worker-based token storage, fingerprint is computed on-demand
  getFingerprint,
};
