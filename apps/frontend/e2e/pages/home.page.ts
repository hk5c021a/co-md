import type { Page, Locator } from '@playwright/test';

/**
 * User home page — document list, contacts, settings.
 */
export class HomePage {
  readonly mainContent: Locator;
  readonly documentList: Locator;
  readonly createDocBtn: Locator;
  readonly docTitleInput: Locator;
  readonly searchInput: Locator;
  readonly userMenu: Locator;
  readonly logoutBtn: Locator;

  constructor(readonly page: Page) {
    this.mainContent = page.locator('#main-content');
    this.documentList = page.locator('[data-testid="document-list"]');
    this.createDocBtn = page.getByRole('button', { name: /new|create|新建|创建/i });
    this.docTitleInput = page.locator('input[placeholder*="title"], input[placeholder*="标题"]');
    this.searchInput = page.locator('input[aria-label*="search"], input[placeholder*="search"]');
    this.userMenu = page.getByRole('button', { name: /user|settings|用户|设置/i });
    this.logoutBtn = page.getByRole('button', { name: /logout|sign out|登出|退出/i });
  }

  async goto() {
    await this.page.goto('/home');
  }

  async waitForLoaded() {
    await this.mainContent.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async createDocument(title: string) {
    await this.createDocBtn.click();
    await this.docTitleInput.fill(title);
    await this.docTitleInput.press('Enter');
  }

  async openDocument(title: string) {
    await this.page.getByText(title).first().click();
  }

  async logout() {
    // On mobile (md:hidden), the logout button is inside a hamburger menu.
    // Open the mobile menu first if the logout button isn't visible.
    if (!(await this.logoutBtn.isVisible())) {
      const mobileMenuBtn = this.page.locator('button.md\\:hidden').filter({
        has: this.page.locator('svg'),
      }).first();
      if (await mobileMenuBtn.isVisible()) {
        await mobileMenuBtn.click();
        await this.page.waitForTimeout(300); // animate-expand-down
      }
    }
    await this.logoutBtn.click();
  }
}
