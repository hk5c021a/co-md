import { test, expect } from '../fixtures/api.fixture';
import { AuthPage } from '../pages/auth.page';

test.describe('Visual Regression', () => {
  test('login page snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#main-content, #root', { timeout: 10_000 });
    await expect(page).toHaveScreenshot('login-page.png', { fullPage: true });
  });

  test('login form inputs snapshot', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    // Fill identifier to trigger CAPTCHA visibility
    await auth.identifierInput.fill('testuser');
    // Mask CAPTCHA question text — it randomizes on every page load
    await expect(page).toHaveScreenshot('login-form-filled.png', {
      fullPage: true,
      mask: [auth.captchaQuestion],
    });
  });
});
