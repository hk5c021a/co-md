/**
 * Lighthouse audit — runs against the production stack via Playwright Chromium.
 *
 * Prerequisite: docker compose --env-file .env.prod.local up -d
 * Run: npx tsx e2e/lighthouse.test.ts
 *
 * Uses Playwright's bundled Chromium (no separate Chrome install needed)
 * to avoid the Windows EPERM temp-dir-cleanup bug in Lighthouse CLI.
 */
import { chromium } from 'playwright';
import { playAudit } from 'playwright-lighthouse';
import lighthouseDesktopConfig from 'lighthouse/core/config/desktop-config.js';
import { appendFileSync, writeFileSync } from 'node:fs';

const BASE_URL = 'https://localhost';
const REPORT_FILE = '../../reports/lighthouse-report.json';

async function main() {
  const browser = await chromium.launch({
    args: [
      '--ignore-certificate-errors',
      '--remote-debugging-port=9222',
      '--no-sandbox',
    ],
    headless: true,
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log('Running Lighthouse audit...\n');

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const results = await playAudit({
      page,
      config: lighthouseDesktopConfig,
      port: 9222,
      thresholds: {
        performance: 70,
        accessibility: 90,
        'best-practices': 90,
        seo: 90,
      },
      opts: {
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    });

    if (!results?.lhr?.categories) {
      console.error('Lighthouse audit returned no results');
      process.exit(1);
    }

    const { categories } = results.lhr;
    console.log('═══ Lighthouse Scores ═══');
    for (const [key, cat] of Object.entries(categories) as [string, any][]) {
      const score = Math.round(cat.score * 100);
      const emoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
      console.log(`  ${emoji} ${cat.title.padEnd(20)} ${score}`);
    }

    writeFileSync(REPORT_FILE, JSON.stringify(results.lhr, null, 2));
    console.log(`\nFull report: ${REPORT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('Lighthouse failed:', e.message);
  process.exit(1);
});
