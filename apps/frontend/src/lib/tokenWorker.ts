/// <reference lib="webworker" />

// ── Token Worker ──
// Runs in a separate thread. Stores refresh token in memory.
// Encrypts and persists to IndexedDB for cold-start recovery.
// The main thread communicates via postMessage.

const DB_NAME = 'co-md-tokens';
const DB_VERSION = 1;
const STORE_NAME = 'tokens';
const RT_KEY = 'refresh_token';
const IDB_RT_ID = 'rt';

// Build-time API base — NOT from main thread (prevents XSS apiBase injection)
const apiBase: string = import.meta.env.VITE_API_URL || '';

// Refresh AT proactively when within this many seconds of expiry
const AT_EXPIRY_GRACE_S = 120; // 2 minutes
const AT_REFRESH_CHECK_MS = 60_000; // check every 60 seconds

let refreshToken: string | null = null;
let accessToken: string | null = null;
let encryptionKey: CryptoKey | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// ── JWT helpers ──

/** Parse JWT payload WITHOUT signature verification (worker is a trusted context). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // atob on base64url → replace -_ with +/, pad with =
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(self.atob(base64));
  } catch {
    return null;
  }
}

/** True if the token will expire within AT_EXPIRY_GRACE_S seconds. */
function isTokenExpiredOrStale(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true; // no exp → assume expired
  // exp is in seconds, Date.now() is in ms
  const expiresAt = (payload.exp as number) * 1000;
  return Date.now() >= expiresAt - AT_EXPIRY_GRACE_S * 1000;
}

/** True if the token is already fully expired (no grace period). */
function isTokenHardExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // no exp → can't tell, assume not expired
  return Date.now() >= (payload.exp as number) * 1000;
}

// ── IndexedDB ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id: string, value: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, ...value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}

async function idbGet(id: string): Promise<{ ciphertext: number[]; iv: number[] } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}

// ── Key derivation ──
// Key material = HKDF(passwordHash + separateSalt).
// passwordHash = PBKDF2-600K pre-hash of user's password — one-way, externals
// cannot reverse it. Combined with a per-user pbkdf2Salt, the resulting AES key
// is not reproducible outside the Worker without knowing the original password.

const KEY_MATERIAL_ID = 'key_material';

async function deriveKey(keyMaterial: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(keyMaterial), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('co-md-rt-key-v2'),
      info: enc.encode('token-worker'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function storeKeyMaterial(passwordHash: string, pbkdf2Salt: string): Promise<void> {
  await idbPut(KEY_MATERIAL_ID, { passwordHash, pbkdf2Salt });
}

async function readKeyMaterial(): Promise<string | null> {
  const record = await idbGet(KEY_MATERIAL_ID);
  if (!record || !(record as unknown as { passwordHash?: string }).passwordHash) return null;
  const km = record as unknown as { passwordHash: string; pbkdf2Salt: string };
  return km.passwordHash + km.pbkdf2Salt;
}

async function deleteKeyMaterial(): Promise<void> {
  await idbDelete(KEY_MATERIAL_ID).catch(() => {});
}

// ── Encrypt / Decrypt ──

async function encryptAndStore(rt: string) {
  if (!encryptionKey) throw new Error('Key not initialised');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    enc.encode(rt)
  );
  await idbPut(IDB_RT_ID, {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  });
}

async function decryptFromStore(): Promise<string | null> {
  if (!encryptionKey) throw new Error('Key not initialised');
  const record = await idbGet(IDB_RT_ID);
  if (!record) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      encryptionKey,
      new Uint8Array(record.ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // Decryption failed — fingerprint changed → clear stale data
    await idbDelete(IDB_RT_ID);
    return null;
  }
}

// ── Token refresh ──

async function callRefresh(): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!refreshToken) return null;

  // Build fingerprint inside the Worker (components supplied via INIT)
  let fp: Record<string, unknown> = {};
  try {
    fp = ((await idbGet('fingerprint')) as unknown as Record<string, unknown>) || {};
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
      body: JSON.stringify({ fingerprint: fp }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;

    // Persist new RT to IndexedDB BEFORE updating in-memory state,
    // so encryption failure doesn't leave us with a dangling RT.
    try {
      if (data.data.refreshToken) await encryptAndStore(data.data.refreshToken);
    } catch {
      return null; // can't persist — abort rotation
    }

    refreshToken = data.data.refreshToken;
    accessToken = data.data.accessToken;
    const at = accessToken;
    const rt = refreshToken;
    if (!at || !rt) return null;
    return { accessToken: at, refreshToken: rt };
  } catch {
    return null;
  }
}

// ── Exponential-backoff retry helper ──

async function callRefreshWithRetry(maxRetries = 3, baseDelayMs = 2000): Promise<{ accessToken: string; refreshToken: string } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
    const result = await callRefresh();
    if (result) return result;
  }
  return null;
}

// ── Proactive refresh timer ──
// Periodically checks AT expiry and refreshes before it expires,
// avoiding a synchronous refresh on the critical path of API calls.
// Also attempts recovery when AT is missing but RT is available
// (e.g. after a failed cold-start refresh).

function startRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = setInterval(async () => {
    // If the RT itself has expired, stop the timer and clear state.
    // The redirect will be triggered naturally by the next apiClient 401.
    if (refreshToken && isTokenHardExpired(refreshToken)) {
      refreshToken = null;
      accessToken = null;
      encryptionKey = null;
      stopRefreshTimer();
      await idbDelete(IDB_RT_ID).catch(() => {});
      await deleteKeyMaterial();
      return;
    }
    // Case 1: AT is stale → proactive refresh
    // Case 2: AT is null but RT exists → cold-start recovery attempt
    const needsRefresh =
      (accessToken && isTokenExpiredOrStale(accessToken)) ||
      (!accessToken && !!refreshToken);
    if (needsRefresh && refreshToken) {
      try {
        const tokens = await callRefresh();
        if (tokens) {
          accessToken = tokens.accessToken;
          refreshToken = tokens.refreshToken;
          self.postMessage({ type: 'AT_REFRESHED', token: tokens.accessToken });
        }
      } catch {
        // Refresh failed — will retry on next interval or on-demand GET_AT
      }
    }
  }, AT_REFRESH_CHECK_MS);
}

function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ── Message handler ──

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT': {
      try {
        // Derive key from stored password hash + pbkdf2 salt (immunizable externally).
        // Fall back to fingerprint key for legacy stored tokens (migration path).
        const km = await readKeyMaterial();
        if (km) {
          encryptionKey = await deriveKey(km);
        } else {
          // Legacy path: pre-existing IndexedDB without key material
          encryptionKey = await deriveKey(JSON.stringify(payload.fingerprint));
        }
        // Store fingerprint for later refresh calls
        await idbPut('fingerprint', payload.fingerprint).catch(() => {});
        // Try to restore RT from IndexedDB
        const stored = await decryptFromStore();
        if (stored) {
          refreshToken = stored;
          if (isTokenHardExpired(stored)) {
            // RT itself has expired — no point retrying. Clear and report.
            refreshToken = null;
            encryptionKey = null;
            stopRefreshTimer();
            await idbDelete(IDB_RT_ID).catch(() => {});
            await deleteKeyMaterial();
            self.postMessage({ type: 'RT_MISSING' });
            return;
          }
          // RT is still valid — try refresh with exponential backoff.
          // If all attempts fail, keep the RT and start the timer — the
          // next periodic check will retry. Never discard a valid RT just
          // because the network is flaky.
          const tokens = await callRefreshWithRetry(3, 2000);
          if (tokens) {
            accessToken = tokens.accessToken;
            refreshToken = tokens.refreshToken;
          }
          // Always start the timer: if tokens is null, recovery will be
          // attempted on the next interval tick (case 2 in startRefreshTimer).
          startRefreshTimer();
          self.postMessage({ type: 'AT_READY', token: tokens ? tokens.accessToken : null });
        } else {
          self.postMessage({ type: 'RT_MISSING' });
        }
      } catch {
        self.postMessage({ type: 'RT_MISSING' });
      }
      break;
    }

    case 'STORE_RT': {
      refreshToken = payload.refreshToken || null;
      accessToken = payload.accessToken || null;
      // Store key material (password hash + salt) for cold-start key recovery
      const { passwordHash, pbkdf2Salt } = payload;
      if (passwordHash && pbkdf2Salt) {
        await storeKeyMaterial(passwordHash, pbkdf2Salt);
        if (!encryptionKey) {
          encryptionKey = await deriveKey(passwordHash + pbkdf2Salt);
        }
      }
      if (refreshToken) {
        try {
          await encryptAndStore(refreshToken);
          startRefreshTimer();
        } catch {
          // Encryption failed — don't confirm storage; main thread will timeout
          return;
        }
      }
      self.postMessage({ type: 'STORED' });
      break;
    }

    case 'GET_AT': {
      // Proactive refresh: if the cached AT is fresh, return it immediately.
      if (accessToken && !isTokenExpiredOrStale(accessToken)) {
        self.postMessage({ type: 'AT_READY', token: accessToken });
        return;
      }
      // AT is missing or expired — try to refresh via RT with retries.
      // Quick retry (2 attempts, 1s delay) — on the critical path of API calls.
      try {
        const tokens = await callRefreshWithRetry(2, 1000);
        if (tokens) {
          accessToken = tokens.accessToken;
          refreshToken = tokens.refreshToken;
          self.postMessage({ type: 'AT_READY', token: tokens.accessToken });
        } else {
          self.postMessage({ type: 'RT_MISSING' });
        }
      } catch {
        self.postMessage({ type: 'RT_MISSING' });
      }
      break;
    }

    case 'CLEAR': {
      stopRefreshTimer();
      refreshToken = null;
      accessToken = null;
      encryptionKey = null;
      await idbDelete(IDB_RT_ID).catch(() => {});
      await deleteKeyMaterial();
      self.postMessage({ type: 'CLEARED' });
      break;
    }

    case 'PING': {
      self.postMessage({ type: 'PONG' });
      break;
    }
  }
};
