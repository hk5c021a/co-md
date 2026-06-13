import type { Context, Next } from 'hono';
import { randomBytes } from 'node:crypto';

// ── Precomputed CSP style hashes for y-prosemirror cursor plugin ──
// y-prosemirror uses `setAttribute('style', ...)` to render remote user cursors
// and labels with dynamic colors. Since these are inline style attributes without
// a nonce, CSP requires either 'unsafe-inline' (too broad) or per-value hashes
// with 'unsafe-hashes'. The 8 user colors produce 24 unique style strings
// (3 patterns per color: border-color, background-color label, background-color selection).
// Hash values are precomputed at build time to avoid runtime crypto in ES modules.
const CURSOR_STYLE_HASHES = [
  // border-color: #4338CA
  "'sha256-i99pttV5zIH+xhyARqvUGVh4rGEGrY6gtsnPnZBwZx0='",
  // background-color: #4338CA
  "'sha256-9mh+x9LkgNUkRSZ6aI2/L2Jc5L+KogLIStlfjC6fkbU='",
  // background-color: #4338CA70
  "'sha256-oHjyeFXyjPR8mCRQRtaB9UGE97//j4x4xxu5DdKNvZc='",
  // border-color: #047857
  "'sha256-LGiBui4vgd3Il3Xdk9KKTX1PgrFv+XlyisqksUQbjBE='",
  // background-color: #047857
  "'sha256-xSPFkMoAk6QiXkFs+S3GWmSX0w7z1gFytes6x8GQJXs='",
  // background-color: #04785770
  "'sha256-ECUACziLHcvec6ooWfh+mXt2Agoyz0Kg15MKUIVo4so='",
  // border-color: #B45309
  "'sha256-Zxv7qoUSTqqkC06VmWUU+YG18MKPBqN3kUgTr+3L/+w='",
  // background-color: #B45309
  "'sha256-xGDZJU/M0oMrQ64AV94pSHXUouov5jkalHgnwIj8/fM='",
  // background-color: #B4530970
  "'sha256-LY1oAlhq+wKV5i3Ksf/nq5uj/dKN/vdWe3wIt4OV+Xc='",
  // border-color: #DC2626
  "'sha256-XNBp7aT093UQeVWAO4QWbzkvqUKHSug09eGWzLQq3zg='",
  // background-color: #DC2626
  "'sha256-QrX6Wq0zkJaY/fxX7DBkfDqJHXcdrKb/V9Df3SUby7I='",
  // background-color: #DC262670
  "'sha256-oVu9Mh5WkUvqzBjjnJosMS5zhrHKevuda55viL2YWGw='",
  // border-color: #6D28D9
  "'sha256-uY+Pw8HvQE+QDTrkPVATt6JTxjuuH9AxyiS9eELbSPA='",
  // background-color: #6D28D9
  "'sha256-u826ycekfKzEWjCEGa8mKogYeIvi6e7O+ZGqW7Guj4I='",
  // background-color: #6D28D970
  "'sha256-dniWDVPu0N7iKMPXxInB2gkC6xBwuqZtxTrpuG712IU='",
  // border-color: #BE185D
  "'sha256-svmJzWproP2MpyKJPGgqFPFiCVU0a/lYhqOUMF+INjo='",
  // background-color: #BE185D
  "'sha256-9xmS9Ul6icRwcgOcCTUH7y7585PMkpCwZeSMlt2/bfQ='",
  // background-color: #BE185D70
  "'sha256-/nPpE7dTJUFDDnuF8Mg4ac75DP1NJIrDe3aZNNnFOY4='",
  // border-color: #0E7490
  "'sha256-sECe0R8w2zaJKDUwrAxEuS4Bgr4pUm9S9Yt7Zhr196E='",
  // background-color: #0E7490
  "'sha256-9/uOd54YjJ3l4FpkHvdjv4u/WFmRZtcPfDzUyj8Jj7Q='",
  // background-color: #0E749070
  "'sha256-N/am8YRJDoMJQnorhaCnA3bprFGRcuEpu5nrzAhPVHs='",
  // border-color: #C2410C
  "'sha256-LSkn62f7MmPW7HHimK9nT2rparFQHYJ+mEbBesgzBLw='",
  // background-color: #C2410C
  "'sha256-V7fXaHY4ij7I0Yvr25pj2dC1JE1ZDqpmcB5Q0foX1Os='",
  // background-color: #C2410C70
  "'sha256-xizZ/X5aYjMAinvOYr3c018k4cjDRshR0YEYUAd0+zM='",
].join(' ');

// Additional style hashes for library-generated inline styles (reported by CSP violations).
const EXTRA_STYLE_HASHES = [
  "'sha256-wdLfdghwESlL+W6Yha9Pg7mYA+KmnhHG3kBIhYfhJrc='",
].join(' ');

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
        : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' 'sha256-5GXPmn+K84I9yGQUsBl7Jci5u/WMLLvvjQp8SQskJps=' 'sha256-YCEeXWoDZ89UzVF7tRjMEo3CaiiIiUS8cDya/j3EJ/8=' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU='`,
      isDev
        ? `style-src 'self' 'unsafe-inline'`
        : `style-src 'self' 'nonce-${nonce}' 'unsafe-hashes' ${CURSOR_STYLE_HASHES} ${EXTRA_STYLE_HASHES}`,
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
    // Must revalidate before reuse (CSP nonce is unique per request).
    // 'no-cache' allows the browser to store the response for conditional
    // revalidation but never serves it without checking with the server first.
    c.res.headers.set('Cache-Control', 'no-cache, must-revalidate');
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
