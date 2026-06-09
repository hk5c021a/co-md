// ── PWA & 性能审计脚本 ──
// 验证 PWA manifest、Service Worker、性能指标（FCP）。
// 需要 backend 运行中（serve 前端静态资源）。
//
// 用法: node scripts/quality-e2e.mjs
//
// 注意: 此脚本与 Playwright E2E 测试互补。
//   - 浏览器 UI 交互测试 → Playwright specs（apps/frontend/e2e/specs/）
//   - API 级别冒烟测试     → system-test.mjs
//   - PWA/性能审计         → 本脚本

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS = resolve(__dirname, '../reports');
mkdirSync(REPORTS, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, detail = '') {
  const entry = { name, passed: !!condition, detail };
  results.push(entry);
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

const browser = await chromium.launch({ headless: true });

// ──────────────────────────────────────────────────
// 1. 性能指标（真实 Performance API）
// ──────────────────────────────────────────────────
console.log('\n=== 性能指标 ===\n');

async function measurePerformance(url, label) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log(`  Measuring ${label} (${url})...`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log(`    ⚠️ Navigation issue: ${e.message.split('\n')[0]}`);
  }

  const metrics = await page.evaluate(() => {
    const nav = /** @type {PerformanceNavigationTiming|undefined} */ (performance.getEntriesByType('navigation')[0]);
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');
    const lcpEntry = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpEntry.length > 0 ? lcpEntry[lcpEntry.length - 1].startTime : undefined;

    return {
      fcp: fcp?.startTime,
      lcp: lcp?.startTime,
      domContentLoaded: nav?.domContentLoadedEventEnd,
      loadComplete: nav?.loadEventEnd,
      transferSize: nav?.transferSize,
      domInteractive: nav?.domInteractive,
    };
  });

  const fcpOk = !metrics.fcp || metrics.fcp < 2500;
  const lcpOk = !metrics.lcp || metrics.lcp < 4000;

  console.log(`    FCP: ${metrics.fcp?.toFixed(0) || 'N/A'}ms | LCP: ${metrics.lcp?.toFixed(0) || 'N/A'}ms | DOM Ready: ${metrics.domContentLoaded?.toFixed(0) || 'N/A'}ms`);
  check(`FCP < 2.5s (${label})`, fcpOk, `FCP=${metrics.fcp?.toFixed(0)}ms`);
  check(`LCP < 4.0s (${label})`, lcpOk, `LCP=${metrics.lcp?.toFixed(0)}ms`);

  // WCAG / SEO basics
  const basics = await page.evaluate(() => ({
    title: document.title,
    hasMain: !!document.querySelector('main, [role="main"], #main-content'),
    hasSkipLink: !!document.querySelector('a[href="#main-content"]'),
    lang: document.documentElement.lang,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
    imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
  }));

  check(`${label}: document has lang`, !!basics.lang, `lang=${basics.lang}`);
  check(`${label}: title set`, basics.title.length > 0);
  check(`${label}: main landmark exists`, basics.hasMain);
  check(`${label}: meta description exists`, basics.description.length > 0);
  check(`${label}: og:title set`, basics.ogTitle.length > 0);
  check(`${label}: og:image set`, basics.ogImage.length > 0);

  await ctx.close();
  return { metrics, basics };
}

await measurePerformance(`${BASE}/`, 'Home');
await measurePerformance(`${BASE}/login`, 'Login');

// ──────────────────────────────────────────────────
// 2. PWA 审计
// ──────────────────────────────────────────────────
console.log('\n=== PWA 审计 ===\n');

// Manifest 内容验证
try {
  const mRes = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = await mRes.json();
  check('PWA: manifest is valid JSON', !!manifest.name && !!manifest.icons, `name=${manifest.name}`);
  check(
    'PWA: manifest has 192x192 icon',
    manifest.icons?.some((i) => i.sizes === '192x192'),
    `${manifest.icons?.length} icon(s)`
  );
  check(
    'PWA: manifest has 512x512 icon',
    manifest.icons?.some((i) => i.sizes === '512x512'),
    `${manifest.icons?.length} icon(s)`
  );
  check('PWA: theme_color set', !!manifest.theme_color);
  check('PWA: display standalone', manifest.display === 'standalone', manifest.display);
  check('PWA: start_url is /', manifest.start_url === '/', manifest.start_url);
} catch (e) {
  check('PWA: manifest fetchable', false, e.message);
}

// Service Worker 注册
{
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 15_000 });
  } catch {
    // navigation may timeout on slow machines
  }
  const swInfo = await page
    .evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { supported: true, registered: false };
      return {
        supported: true,
        registered: true,
        active: !!reg.active,
        waiting: !!reg.waiting,
        scope: reg.scope,
      };
    })
    .catch(() => ({ error: true }));
  check('PWA: SW API supported', swInfo?.supported === true);
  check('PWA: SW registered', swInfo?.registered === true, JSON.stringify(swInfo));
  check('PWA: SW active', swInfo?.active === true);
  await ctx.close();
}

// ──────────────────────────────────────────────────
// 3. API 安全头（非 HTML 响应）
// ──────────────────────────────────────────────────
console.log('\n=== API 安全头 ===\n');

try {
  const apiRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'x', passwordHash: 'a'.repeat(32) }),
  });
  const hdrs = apiRes.headers;
  check('API: Cache-Control no-store', (hdrs.get('cache-control') || '').includes('no-store'));
  check('API: X-Content-Type-Options', hdrs.get('x-content-type-options') === 'nosniff');
  check('API: X-Frame-Options', hdrs.get('x-frame-options') === 'DENY');
  check('API: HSTS set', !!(hdrs.get('strict-transport-security') || ''));
} catch (e) {
  check('API: security headers check', false, e.message);
}

// ──────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────
await browser.close();

const total = passed + failed;
console.log(`\n========================================`);
console.log(`  QUALITY AUDIT: ${passed}/${total} passed`);
console.log(`========================================`);

const reportData = {
  timestamp: new Date().toISOString(),
  passed,
  failed,
  total,
  results,
};
writeFileSync(resolve(REPORTS, 'quality-audit.json'), JSON.stringify(reportData, null, 2));
console.log(`\nReport saved to: reports/quality-audit.json`);

if (failed > 0) process.exit(1);
