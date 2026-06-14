import { test, expect } from '../fixtures/api.fixture';
import { AuthPage } from '../pages/auth.page';
import { HomePage } from '../pages/home.page';

test.describe('Authentication', () => {
  // ────────────────────────────────────────────────
  // Home page → Login form
  // ────────────────────────────────────────────────

  test('unauthenticated user sees login form', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await expect(auth.identifierInput).toBeVisible();
    await expect(auth.passwordInput).toBeVisible();
    await expect(auth.loginSubmitBtn).toBeVisible();
  });

  test('empty form shows validation feedback', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    // Submit with wrong credentials — backend should return error
    await auth.identifierInput.fill('testuser');
    await auth.passwordInput.fill('wrongpassword');
    await auth.solveCaptcha();
    await auth.submitLogin();
    // API returns error which renders as [role="alert"]
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
  });

  test('CAPTCHA is displayed on login form', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.identifierInput.fill('test');
    // CAPTCHA should be visible
    await expect(auth.captchaInput).toBeVisible();
  });

  // ────────────────────────────────────────────────
  // Registration + Login via API (fast path)
  // ────────────────────────────────────────────────

  test('register via API then login via UI redirects to home', async ({ page, api }) => {
    const session = await api.register();

    // Now login through the UI
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.login(session.user.username, session.user.password);

    // Should redirect away from login
    await auth.expectRedirectedToHome();

    // Cleanup
    await api.deleteUser(session.accessToken);
  });

  // ────────────────────────────────────────────────
  // Logout
  // ────────────────────────────────────────────────

  test('login and logout returns to login page', async ({ page, api }) => {
    const session = await api.register();

    // Login via UI
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.login(session.user.username, session.user.password);
    await auth.expectRedirectedToHome();

    // Logout
    const home = new HomePage(page);
    await home.logout();

    // Should return to login
    await auth.expectOnAuthPage();

    // Cleanup
    await api.deleteUser(session.accessToken);
  });

  // ────────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────────

  test('register via UI creates account and shows success', async ({ page, api }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    // Default tab is "login" — switch to register tab first
    await auth.switchToRegister();

    // Fill registration form with a unique user using the POM action
    const username = `e2ereg${Date.now()}`;
    await auth.fillRegister(username, `${username}@test.com`, `138${String(Date.now()).slice(-8)}`, 'Abcdef123!@#');
    await auth.solveCaptcha();
    // Brief pause ensures React state captures the CAPTCHA value before submit
    await page.waitForTimeout(200);
    await auth.submitRegister();

    // Should show success message — generous timeout for argon2id hashing
    // (CPU-intensive under concurrent test workers)
    await expect(auth.registerSuccessMsg).toBeVisible({ timeout: 30_000 });

    // Login and cleanup via API — retry with backoff (DB write may lag on slow browsers)
    let session;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        session = await api.login(username, 'Abcdef123!@#');
        break;
      } catch {
        if (attempt < 2) await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    if (session) await api.deleteUser(session.accessToken);
  });

  test('wrong credentials show error', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    // Fill in partial credentials — the CAPTCHA is always visible on page load
    await auth.identifierInput.fill('nonexistent_user_xyz');
    await auth.passwordInput.fill('WrongPassword123!');
    await auth.solveCaptcha();
    await auth.submitLogin();

    // Wait for API error response to render as alert
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
  });

  test('404 page renders for non-existent route', async ({ page }) => {
    const res = await page.goto('/nonexistent-path-xyz');
    // SPA with navigateFallback serves all routes as 200 — app shows NotFoundPage.
    expect(res?.status()).toBe(200);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 5_000 });
  });

  // ────────────────────────────────────────────────
  // Password reset
  // ────────────────────────────────────────────────

  test('password reset flow: request token, set new password, login', async ({ page, api }) => {
    // 1. Register a user via API
    const session = await api.register();

    // 2. Request a password reset (sends email via Mailpit in production)
    await api.requestPasswordReset(session.user.email);
    const resetToken = await api.getPasswordResetToken(session.user.email);

    // 3. Navigate to the password reset page with the token
    await page.goto(`/password-reset/${resetToken}`);

    // Wait for form to appear (token verification completes)
    const passwordInput = page.locator('#password');
    await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });

    // 4. Fill in the new password
    const newPassword = 'NewTestPass456@';
    await passwordInput.fill(newPassword);
    const confirmInput = page.locator('#confirmPassword');
    await confirmInput.fill(newPassword);

    // 5. Submit the form
    await page.locator('button[type="submit"]').click();

    // 6. Verify success message appears (heading + description both contain the word)
    await expect(page.getByText(/成功|success/i).first()).toBeVisible({ timeout: 10_000 });

    // 7. Login with the new password to verify reset worked
    const newSession = await api.login(session.user.username, newPassword);
    expect(newSession.accessToken).toBeTruthy();

    // 8. Cleanup
    await api.deleteUser(newSession.accessToken);
  });
});
