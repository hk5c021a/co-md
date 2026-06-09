import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenProvider } from './hooks/useToken';
import { ToastProvider } from './components/ui/toast';
import { AuthPage } from './pages/AuthPage';
import { UserHomePage } from './pages/UserHomePage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import './i18n';
import './globals.css';

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
tokenStore.init().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const router = createBrowserRouter([
  { path: '/', element: <UserHomePage /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/editor/:fileId?', element: <DocumentEditorPage /> },
  { path: '/password-reset/:token?', element: <PasswordResetPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

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
