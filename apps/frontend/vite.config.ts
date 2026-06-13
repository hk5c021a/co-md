import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

import type { Plugin } from 'vite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// NOTE: Frontend dist is ~15MB due to CodeMirror language modes (bundled by
// Milkdown/Shiki). Shiki v4 bundles all TextMate grammars into a single chunk,
// and Milkdown's CodeMirror integration adds per-language mode chunks that
// cannot be safely tree-shaken at build time without breaking lazy-loading.
//
// The createHighlighter({ langs: [...] }) call already limits runtime loading,
// but the bundler must include all possible chunks to satisfy dynamic import().
// This is a known limitation. See: shiki#778, milkdown#1542.

// ── HTML post-processing: prefetch editor chunk + async SW registration ──
function htmlPostPlugin(): Plugin {
  return {
    name: 'html-post',
    enforce: 'post',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const assetsDir = resolve(distDir, 'assets');
      const indexHtml = resolve(distDir, 'index.html');
      if (!existsSync(indexHtml)) return;
      let html = readFileSync(indexHtml, 'utf-8');
      let changes = 0;

      // 1. Prefetch lazy-loaded editor chunk on idle
      const files = readdirSync(assetsDir).filter(f => f.endsWith('.js'));
      const editorChunk = files.find(f => /^DocumentEditorPage-[A-Za-z0-9_]+\.js$/.test(f));
      if (editorChunk) {
        html = html.replace('</head>', `\n  <link rel="modulepreload" href="/assets/${editorChunk}">\n</head>`);
        changes++;
      }

      // 2. Add async to registerSW.js so it doesn't block the critical path
      html = html.replace(
        '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js">',
        '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js" async>'
      );
      changes++;

      writeFileSync(indexHtml, html);
      console.log(`[html-post] ${changes} optimizations applied (prefetch + async SW)`);
    },
  };
}

export default defineConfig({
  plugins: [
    htmlPostPlugin(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon-32.png', 'logo.svg'],
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'CO-MD — Collaborative Markdown Editor',
        short_name: 'CO-MD',
        description: 'Real-time collaborative Markdown editor with syntax highlighting',
        start_url: '/',
        display: 'standalone',
        background_color: '#f1f5f4',
        theme_color: '#0f766e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['pwa-*.png', 'favicon-32.png', '*.svg', 'manifest.webmanifest'],
        // IMPORTANT: Do NOT precache index.html or use navigateFallback.
        // CSP nonce is injected per-request by the backend (serveIndexWithNonce),
        // and a precached index.html would contain stale __CSP_NONCE__ placeholders
        // with no nonce on <script> tags. When the SW serves it, the browser blocks
        // all scripts because 'strict-dynamic' ignores 'self' and requires nonces.
        // SPA fallback is handled by the backend's notFound middleware instead.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          // HTML: NetworkOnly (CSP nonce is unique per request)
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkOnly' },
          // JS: CacheFirst (hashed filenames)
          { urlPattern: /\.(?:m?js)$/i, handler: 'CacheFirst', options: { cacheName: 'static-js', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 } } },
          // CSS: CacheFirst
          { urlPattern: /\.(?:css)$/i, handler: 'CacheFirst', options: { cacheName: 'static-css', expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 } } },
          // Fonts: CacheFirst
          { urlPattern: /\.(?:woff2?|ttf|otf)$/i, handler: 'CacheFirst', options: { cacheName: 'static-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } } },
          // Images: StaleWhileRevalidate
          { urlPattern: /\.(?:png|ico|webp|gif|jpe?g)$/i, handler: 'StaleWhileRevalidate', options: { cacheName: 'static-images', expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 } } },
          // API: NetworkFirst
          { urlPattern: /^\/api\/documents\/\d+$/, handler: 'NetworkFirst', options: { cacheName: 'api-documents', networkTimeoutSeconds: 5, expiration: { maxEntries: 30, maxAgeSeconds: 60 } } },
          { urlPattern: /^\/api\/documents$/, handler: 'NetworkFirst', options: { cacheName: 'api-documents-list', networkTimeoutSeconds: 5, expiration: { maxEntries: 10, maxAgeSeconds: 30 } } },
          { urlPattern: /^\/api\/users\/me$/, handler: 'NetworkFirst', options: { cacheName: 'api-users', networkTimeoutSeconds: 3, expiration: { maxEntries: 5, maxAgeSeconds: 300 } } },
        ],
      },
    }),
  ],
  // Vue esm-bundler flags — transitive deps (Milkdown/ProseMirror) pull in Vue,
  // which expects these compile-time flags for optimal tree-shaking.
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  // ── Chunk splitting: keep heavy deps out of the main editor chunk ──
  // Shiki (~600KB) is already split via dynamic import() in Editor.tsx.
  // Yjs ecosystem (~300KB) is split via manualChunks below.
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-yjs': ['yjs', 'y-indexeddb', 'lib0'],
        },
      },
    },
  },
  optimizeDeps: {
    rolldownOptions: {},
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    https: {
      key: resolve(__dirname, '../../certs/key.pem'),
      cert: resolve(__dirname, '../../certs/cert.pem'),
    },
    proxy: {
      '/api': {
        target: 'https://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'https://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // ── VitePlus extras ──
  lint: {
    ignorePatterns: ['dist/**', 'node_modules/**'],
  },
  fmt: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
  },
  staged: {
    '*': 'vp check --fix',
    '*.{ts,tsx}': 'vp check --fix',
  },
});
