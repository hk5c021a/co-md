import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    args: ['--ignore-certificate-errors'],
  });
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
  });

  const logs: string[] = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[REQ_FAILED] ${req.url()}: ${req.failure()?.errorText}`));

  try {
    await page.goto('https://localhost/', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
  } catch(e: any) {
    logs.push(`[GOTO_ERROR] ${e.message}`);
  }

  const html = await page.content();
  logs.push(`[HTML_SNIPPET] ${html.substring(0, 500)}`);

  console.log(logs.join('\n'));
  await browser.close();
})();
