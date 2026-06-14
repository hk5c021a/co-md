import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenProvider, useToken } from './hooks/useToken';
import { ToastProvider } from './components/ui/toast';
import { PageSpinner } from './components/ui/spinner';
import { createLazyPage } from './lib/lazyPage';
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

// ── Route-level lazy loading ──
// All page components are lazy-loaded via createLazyPage() to keep the
// initial bundle small (~350KB). Only the DocumentEditorPage was lazy before;
// now AuthPage, UserHomePage, PasswordResetPage, ForbiddenPage, and
// NotFoundPage are also split into their own chunks.

const LazyAuthPage = createLazyPage(() => import('./pages/AuthPage').then(m => m.AuthPage), 'Login');
const LazyHomePage = createLazyPage(() => import('./pages/UserHomePage').then(m => m.UserHomePage), 'Home');
const LazyEditorPage = createLazyPage(() => import('./pages/DocumentEditorPage').then(m => m.DocumentEditorPage), 'Editor');
const LazyPasswordResetPage = createLazyPage(() => import('./pages/PasswordResetPage').then(m => m.PasswordResetPage), 'Password Reset');
const LazyForbiddenPage = createLazyPage(() => import('./pages/ForbiddenPage').then(m => m.ForbiddenPage), '403');
const LazyNotFoundPage = createLazyPage(() => import('./pages/NotFoundPage').then(m => m.NotFoundPage), '404');

// ── AuthGuard — redirects unauthenticated users BEFORE lazy chunk download ──
// The auth check runs synchronously inside the guard, which is rendered BEFORE
// the lazy page component. This means unauthenticated users are redirected
// without ever downloading the editor chunk (~1.5MB) or any other protected chunk.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading } = useToken();
  if (isAuthLoading) return <PageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return createElement('div', null, children);
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
  { path: '/', element: createElement(LazyHomePage) },
  { path: '/login', element: createElement(LazyAuthPage) },
  { path: '/editor/:fileId?', element: createElement(AuthGuard, { children: createElement(LazyEditorPage) }) },
  { path: '/password-reset/:token?', element: createElement(LazyPasswordResetPage) },
  { path: '/403', element: createElement(LazyForbiddenPage) },
  { path: '*', element: createElement(LazyNotFoundPage) },
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
