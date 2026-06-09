import type { Context, Next } from 'hono';
import { randomBytes } from 'node:crypto';

// CSP nonce middleware — generates per-request nonce, injects CSP headers,
// and passes the nonce to downstream handlers via c.get('cspNonce').
// NOTE: nonce is generated per-request including API calls (16 bytes CSPRNG).
// The overhead is negligible (microseconds) and ensures the nonce is always
// available for HTML responses without fragile path-based heuristics.
export async function cspMiddleware(c: Context, next: Next) {
  const nonce = randomBytes(16).toString('base64');
  c.set('cspNonce', nonce);

  await next();

  const ct = c.res.headers.get('Content-Type') || '';
  if (ct.includes('text/html')) {
    // ⚠️ DEV MODE: XSS protection is disabled for HMR compatibility.
    // NEVER deploy with NODE_ENV != 'production'.
    const isDev = process.env.NODE_ENV !== 'production';

    const csp = [
      "default-src 'none'",
      isDev
        ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
        : `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' 'sha256-5GXPmn+K84I9yGQUsBl7Jci5u/WMLLvvjQp8SQskJps=' 'sha256-YCEeXWoDZ89UzVF7tRjMEo3CaiiIiUS8cDya/j3EJ/8='`,
      isDev ? `style-src 'self' 'unsafe-inline'` : `style-src 'self' 'nonce-${nonce}'`,
      `font-src 'self' data:`,
      "img-src 'self' data: blob:",
      isDev
        ? "connect-src 'self' https://localhost:5173 wss://localhost:5173 wss://localhost:4000"
        : "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "require-trusted-types-for 'script'",
      // Named Trusted Types policies used by the application.
      // 'default' policy allows same-origin script URLs only (no third-party).
      // 'sw-url' and 'token-worker-url' allow Service Worker and Token Worker blob URLs.
      "trusted-types 'allow-duplicates' default sw-url token-worker-url dompurify vue",
      "worker-src 'self'",
      "upgrade-insecure-requests",
      'report-to csp-endpoint',
      'report-uri /api/csp-report',
    ].join('; ');

    c.res.headers.set('Content-Security-Policy', csp);
    // Reporting API requires absolute URLs — resolve against request origin
    const reportUrl = `${new URL(c.req.url).origin}/api/csp-report`;
    c.res.headers.set('Reporting-Endpoints', `csp-endpoint="${reportUrl}"`);
    // Prevent CDNs/browsers from caching HTML with embedded CSP nonces
    c.res.headers.set('Cache-Control', 'no-store');
    // Security headers — also added for API responses below
    c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    c.res.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  } else {
    // API/data responses: security headers + prevent caching of sensitive data.
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Additional security headers (helmet-style hardening)
    c.res.headers.set('X-DNS-Prefetch-Control', 'off');
    c.res.headers.set('X-Download-Options', 'noopen');
    c.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
    // Skip static assets (CSS, JS, images, fonts) — they already have proper
    // Cache-Control headers from upstream (Caddy/Vite).
    const isStaticAsset =
      ct.includes('text/css') ||
      ct.includes('application/javascript') ||
      ct.includes('image/') ||
      ct.includes('font/') ||
      ct.includes('application/font');
    if (!isStaticAsset) {
      c.res.headers.set('Cache-Control', 'no-store, private');
    }
  }
}
