import type { Page, Locator } from '@playwright/test';

/**
 * Auth page object — login / register / password-reset forms.
 *
 * Pattern: exposes locators for assertions + action methods for flows.
 * See: https://playwright.dev/docs/pom
 */
export class AuthPage {
  // ── Locators ──
  readonly mainContent: Locator;
  readonly loginTab: Locator;
  readonly registerTab: Locator;

  // Login form
  readonly identifierInput: Locator;
  readonly passwordInput: Locator;
  readonly captchaInput: Locator;
  readonly captchaQuestion: Locator;
  readonly loginSubmitBtn: Locator;

  // Register form
  readonly regUsernameInput: Locator;
  readonly regPhoneInput: Locator;
  readonly regEmailInput: Locator;
  readonly regPasswordInput: Locator;
  readonly regConfirmPasswordInput: Locator;
  readonly regSubmitBtn: Locator;

  // Error / feedback
  readonly formError: Locator;
  readonly toast: Locator;
  readonly registerSuccessMsg: Locator;

  constructor(readonly page: Page) {
    // Common
    this.mainContent = page.locator('#main-content');
    this.toast = page.locator('[role="status"], [role="alert"]').first();

    // Login
    this.identifierInput = page.locator('#identifier');
    this.passwordInput = page.locator('#password');
    // CAPTCHA input: use name= attribute (react-hook-form in production omits id)
    this.captchaInput = page.locator('input[name="captchaAnswer"]');
    // CAPTCHA question text: "NN + NN = ?" or "NN × NN = ?"
    this.captchaQuestion = page.getByText(/^\d+\s*[+×x]\s*\d+\s*=\s*\?/);
    this.loginSubmitBtn = page.locator('#main-content button[type="submit"]').first();

    // Register
    this.regUsernameInput = page.locator('#reg-username');
    this.regPhoneInput = page.locator('#reg-phone');
    this.regEmailInput = page.locator('#reg-email');
    this.regPasswordInput = page.locator('#reg-password');
    this.regConfirmPasswordInput = page.locator('#reg-confirm-password');
    this.regSubmitBtn = page.locator('#main-content button[type="submit"]').last();

    // Error
    this.formError = page.locator('[role="alert"]').first();
    this.registerSuccessMsg = page.getByText(/注册成功|successful/i);
  }

  // ── Actions ──

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForSelector('#main-content', { timeout: 15_000 });
  }

  async fillLogin(identifier: string, password: string) {
    await this.identifierInput.fill(identifier);
    await this.passwordInput.fill(password);
  }

  async solveCaptcha(): Promise<void> {
    // Find CAPTCHA text anywhere on page — "12 + 34 = ?" or "53 × 77 = ?"
    const text = await this.page.locator('text=/\\d+\\s*[+×x×]\\s*\\d+/i').first().textContent().catch(() => null);
    if (!text) return;
    const match = text.match(/(\d+)\s*([+×x×])\s*(\d+)/i);
    if (match) {
      const a = parseInt(match[1]), b = parseInt(match[3]);
      const op = match[2];
      const answer = op === '+' ? a + b : a * b;
      await this.captchaInput.fill(String(answer));
    }
  }

  async submitLogin() {
    await this.loginSubmitBtn.click();
  }

  async login(identifier: string, password: string) {
    await this.fillLogin(identifier, password);
    await this.solveCaptcha();
    await this.submitLogin();
  }

  async switchToRegister() {
    // Click the "create account" button at the bottom of the login form
    await this.page.getByText(/创建账号|create account/i).click();
    await this.page.waitForSelector('#reg-username', { timeout: 5_000 });
  }

  async fillRegister(username: string, email: string, phone: string, password: string) {
    await this.regUsernameInput.fill(username);
    await this.regEmailInput.fill(email);
    await this.regPhoneInput.fill(phone);
    await this.regPasswordInput.fill(password);
    await this.regConfirmPasswordInput.fill(password);
  }

  async submitRegister() {
    await this.regSubmitBtn.click();
  }

  async register(username: string, email: string, phone: string, password: string) {
    await this.fillRegister(username, email, phone, password);
    await this.solveCaptcha();
    await this.submitRegister();
  }

  // ── Assertions ──

  async expectOnAuthPage() {
    await this.page.waitForURL(/\/login/);
  }

  async expectRedirectedToHome() {
    // After login, navigate from /login to / — distinct routes now.
    // Poll until home page element appears (handles auth state transition delay).
    const { expect: playwrightExpect } = await import('@playwright/test');
    await playwrightExpect
      .poll(
        async () => {
          return await this.page.locator('[data-testid="home-page"]').count();
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
    // Double-check URL changed
    await this.page.waitForURL('https://localhost/', { timeout: 1_000 });
  }
}
