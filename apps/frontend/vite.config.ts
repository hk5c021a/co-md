import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
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
        // Precache index.html so NavigationRoute can serve SPA fallback.
        // Contains __CSP_NONCE__ placeholders (replaced by backend at runtime).
        additionalManifestEntries: [{ url: '/index.html', revision: null }],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws-server\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
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
