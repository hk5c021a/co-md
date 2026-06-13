import { useState, useEffect, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenProvider, useToken } from './hooks/useToken';
import { ToastProvider } from './components/ui/toast';
import { AuthPage } from './pages/AuthPage';
import { UserHomePage } from './pages/UserHomePage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { Spinner } from './components/ui/spinner';
import { PageSpinner } from './components/ui/spinner';
import './i18n';
import './globals.css';

// ── Global error handlers ──
// Unhandled promise rejections — log for debugging.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[APP] Unhandled promise rejection:', event.reason);
});

// Uncaught errors — log but don't crash the SPA.
window.addEventListener('error', (event) => {
  console.error('[APP] Uncaught error:', event.error || event.message);
});

// ── Manual lazy-load for the editor chunk (~1.5MB) ──
// Uses useState + useEffect instead of React.lazy() + Suspense to avoid
// React error #306 (Invalid hook call) triggered by tokenStore Worker
// message -> state update during a Suspense transition.
let _EditorModule: React.ComponentType<any> | null = null;
let _EditorPromise: Promise<React.ComponentType<any>> | null = null;

function LazyEditor() {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(() => _EditorModule);
  useEffect(() => {
    if (_EditorModule) return;
    let cancelled = false;
    if (!_EditorPromise) {
      _EditorPromise = import('./pages/DocumentEditorPage').then(m => m.DocumentEditorPage);
    }
    _EditorPromise.then(mod => {
      if (cancelled) return;
      _EditorModule = mod;
      setComp(() => mod);
    });
    return () => { cancelled = true; };
  }, []);

  if (!Comp) {
    return createElement('div', {
      className: 'flex flex-col items-center justify-center min-h-dvh gap-4',
    },
      createElement(Spinner, { size: 'lg' }),
      createElement('p', {
        className: 'text-sm text-text-secondary dark:text-zinc-400',
      }, 'Loading editor…'));
  }
  return createElement(Comp);
}

// ── AuthGuard — redirects unauthenticated users BEFORE lazy chunk download ──
// Previously the auth check was inside DocumentEditorPage (inside the 1.8MB lazy chunk),
// forcing unauthenticated users to download the entire editor before being redirected.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading } = useToken();
  if (isAuthLoading) return <PageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Trusted Types — CSP enforcement for XSS prevention ──
if (typeof window !== 'undefined' && (window as any).trustedTypes?.createPolicy) {
  try {
    (window as any).trustedTypes.createPolicy('default', {
      createHTML: (input: string) => {
        throw new TypeError('TrustedTypes: createHTML not allowed by default policy');
      },
      createScriptURL: (input: string) => {
        try {
          const url = new URL(input, location.origin);
          if (url.origin === location.origin) return input;
        } catch { /* invalid URL */ }
        throw new TypeError('TrustedTypes: script URL must be same-origin');
      },
    });
  } catch { /* already exists */ }
  // Named policies for libraries that need createHTML
  try { (window as any).trustedTypes.createPolicy('dompurify', { createHTML: (i: string) => i }); } catch {}
  try { (window as any).trustedTypes.createPolicy('vue', { createHTML: (i: string) => i }); } catch {}
}

// ── Token Worker initialization — pre-derive encryption key via Web Worker ──
import { tokenStore } from './lib/tokenStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const router = createBrowserRouter([
  { path: '/', element: <UserHomePage /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/editor/:fileId?', element: <AuthGuard><LazyEditor /></AuthGuard> },
  { path: '/password-reset/:token?', element: <PasswordResetPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

// Await token decryption before rendering — AuthGuard needs the IndexedDB
// token to be available before checking isAuthenticated. Without this,
// AuthGuard redirects authenticated users to /login because the token
// hasn't been decrypted from IndexedDB yet.
// Fire-and-forget init for early key derivation, but also await before first render.
const _earlyInit = tokenStore.init().catch(() => {});

async function bootstrap() {
  await _earlyInit;
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <QueryClientProvider client={queryClient}>
      <TokenProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TokenProvider>
    </QueryClientProvider>
  );
}
bootstrap();
