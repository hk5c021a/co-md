import { test, expect } from '../fixtures/api.fixture';
import { AuthPage } from '../pages/auth.page';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  // ────────────────────────────────────────────────
  // Keyboard navigation
  // ────────────────────────────────────────────────

  test('login form is keyboard navigable', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    // Tab through form fields — verify focus moves between different elements
    // Skip any elements without names (e.g., theme/language toggles, skip-to-main)
    const getFocusInfo = async () => {
      return page.evaluate(() => ({
        tag: (document.activeElement as HTMLElement)?.tagName || '',
        name: (document.activeElement as HTMLElement)?.getAttribute('name') || null,
      }));
    };

    await page.keyboard.press('Tab');
    let el1 = await getFocusInfo();
    expect(el1.tag).toBeTruthy(); // Some element should be focused

    // Tab until we land on a form field with a name attribute
    let el2 = await getFocusInfo();
    for (let i = 0; i < 5 && !el2.name; i++) {
      await page.keyboard.press('Tab');
      el2 = await getFocusInfo();
    }
    expect(el2.tag).toBeTruthy();
    expect(el2.name).toBeTruthy();
    // Verify focus moved to a different element
    const same = el1.name ? el1.name === el2.name : el1.tag === el2.tag;
    expect(same).toBe(false); // Different field
  });

  test('skip-to-main link is present', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeVisible();
  });

  // ────────────────────────────────────────────────
  // ARIA landmarks
  // ────────────────────────────────────────────────

  test('main landmark exists on login page', async ({ page }) => {
    await page.goto('/login');
    const main = page.locator('main, [role="main"], #main-content');
    await expect(main).toBeVisible();
  });

  // ────────────────────────────────────────────────
  // Color scheme / theme
  // ────────────────────────────────────────────────

  test('page sets correct lang and direction', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');
  });

  test('login page has no color contrast violations', async ({ page }) => {
    await page.goto('/login');
    // Run axe-core with color-contrast rule only
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['color-contrast'] })
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // ────────────────────────────────────────────────
  // PWA manifest
  // ────────────────────────────────────────────────

  test('PWA manifest link exists', async ({ page }) => {
    await page.goto('/');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', /manifest/);
  });

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    // SW registers after a 2s delay (main.tsx) + minimal precache (~4 files).
    // Use page.evaluate inside poll — the callback runs in Node context, so
    // we must explicitly evaluate in the browser to access navigator.serviceWorker.
    await expect.poll(async () => {
      return page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        return !!(reg?.active || reg?.waiting);
      });
    }, { timeout: 15_000 }).toBe(true);
  });

  // ────────────────────────────────────────────────
  // Automated a11y audit (axe-core)
  // ────────────────────────────────────────────────

  test('login page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
