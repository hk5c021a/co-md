import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { tokenStore } from '../lib/tokenStore';
import { API_BASE } from '../lib/apiClient';

interface TokenContextValue {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  checkAuth: () => Promise<boolean>;
  refreshAndCheck: () => Promise<boolean>;
  logout: () => Promise<void>;
  setAuthenticated: (value: boolean) => void;
  broadcastLogin: () => void;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const at = await tokenStore.getAccessToken();
      if (!at) {
        setIsAuthenticated(false);
        return false;
      }
      tokenStore.accessToken = at;
      const response = await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      const data = await response.json();
      if (data.success) {
        setIsAuthenticated(true);
        return true;
      }
      setIsAuthenticated(false);
      return false;
    } catch (err) {
      // Network error — don't log out if we already have a token
      // (transient network issues shouldn't force re-login)
      if (tokenStore.accessToken) return true;
      setIsAuthenticated(false);
      return false;
    }
  }, []);

  const refreshAndCheck = useCallback(async (): Promise<boolean> => {
    // Worker handles refresh internally via GET_AT
    const at = await tokenStore.getAccessToken();
    if (at) {
      tokenStore.accessToken = at;
      return checkAuth();
    }
    setIsAuthenticated(false);
    return false;
  }, [checkAuth]);

  // Run auth check on mount
  const initAuth = useCallback(async () => {
    const path = window.location.pathname;
    // Always initialise the token worker (key derivation) even on auth pages,
    // otherwise storeTokens() will hang because the worker has no encryptionKey.
    const at = await tokenStore.init();
    if (path === '/login' || path === '/password-reset' || path === '/403' || path === '/404') {
      setIsAuthenticated(false);
      setIsAuthLoading(false);
      return;
    }

    setIsAuthLoading(true);
    try {
      if (at) {
        tokenStore.accessToken = at;
        await checkAuth();
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
    setIsAuthLoading(false);
  }, [checkAuth]);

  // Auto-init on first mount
  const initDone = useRef(false);
  useEffect(() => {
    if (!initDone.current) {
      initDone.current = true;
      initAuth();
    }
  }, [initAuth]);

  // ── Cross-tab auth sync ──
  // Guard to prevent self-broadcast: when this tab initiates a login,
  // the BroadcastChannel handler must not re-run initAuth (which races
  // with IndexedDB writes and can reset isAuthenticated).
  const ignoreNextBroadcast = useRef(false);
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('co-md-auth');
      bc.onmessage = (e) => {
        if (e.data === 'logout') {
          tokenStore.clearAll().catch(() => {});
          setIsAuthenticated(false);
        } else if (e.data?.type === 'token_refreshed') {
          // Another tab's Worker proactively refreshed its AT.
          // Update our module-level cache so apiFetch won't hit 401.
          tokenStore.accessToken = e.data.token;
        } else if (e.data === 'login_other') {
          if (ignoreNextBroadcast.current) {
            ignoreNextBroadcast.current = false;
            return;
          }
          // Another tab just logged in — re-init auth in this tab.
          // Retry up to 3 times with 200ms delay to wait for IndexedDB writes
          // from the login tab to complete (avoids reading stale state).
          const tryInit = async (attempts = 0): Promise<void> => {
            try {
              await initAuth();
            } catch {
              if (attempts < 2) {
                await new Promise((r) => setTimeout(r, 200));
                return tryInit(attempts + 1);
              }
            }
          };
          tryInit().catch(() => {});
        }
      };
      return () => bc.close();
    } catch {
      // BroadcastChannel not supported
    }
  }, [initAuth]);

  // Reusable post-only BroadcastChannel — avoids leaking instances
  const bcRef = useRef<BroadcastChannel | null>(null);
  const getBC = useCallback(() => {
    if (!bcRef.current) {
      try {
        bcRef.current = new BroadcastChannel('co-md-auth');
      } catch {
        return null;
      }
    }
    return bcRef.current;
  }, []);

  // Set the guard before broadcasting login — exposed via context for useLogin
  const broadcastLogin = useCallback(() => {
    ignoreNextBroadcast.current = true;
    getBC()?.postMessage('login_other');
  }, [getBC]);

  const logout = useCallback(async () => {
    await tokenStore.clearAll();
    setIsAuthenticated(false);
    getBC()?.postMessage('logout');
  }, [getBC]);

  return (
    <TokenContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        checkAuth,
        refreshAndCheck,
        logout,
        setAuthenticated: setIsAuthenticated,
        broadcastLogin,
      }}
    >
      {children}
    </TokenContext.Provider>
  );
}

export function useToken() {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error('useToken must be used within TokenProvider');
  }
  return context;
}
