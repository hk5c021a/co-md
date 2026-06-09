import type { Page, Locator } from '@playwright/test';

/**
 * Document editor page — Milkdown collaborative editor.
 */
export class EditorPage {
  readonly editorContainer: Locator;
  readonly milkdownEditor: Locator;
  readonly titleInput: Locator;
  readonly connectionStatus: Locator;
  readonly onlineUsers: Locator;
  readonly sidebar: Locator;
  readonly permissionPanel: Locator;

  constructor(readonly page: Page) {
    this.editorContainer = page.locator('.milkdown-editor');
    this.milkdownEditor = page.locator('.milkdown');
    this.titleInput = page.locator('[contenteditable].ProseMirror').first();
    this.connectionStatus = page.locator('[data-testid="connection-status"]');
    this.onlineUsers = page.locator('[data-testid="online-users"]');
    this.sidebar = page.locator('[data-testid="sidebar"]');
    this.permissionPanel = page.locator('[data-testid="permission-panel"]');
  }

  async goto(documentId: string) {
    await this.page.goto(`/documents/${documentId}`);
  }

  async waitForLoaded() {
    // Editor is loaded when milkdown editor is visible and not showing loading state
    await this.milkdownEditor.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async typeInEditor(text: string) {
    // Target the actual editable surface inside Milkdown.
    // On mobile viewports, the `.milkdown` wrapper may be partially covered
    // by sidebar or header, so we use force:true and explicit coordinates.
    const proseMirror = this.page.locator('.ProseMirror[contenteditable="true"]');
    await proseMirror.waitFor({ state: 'visible', timeout: 10_000 });
    await proseMirror.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(500);
    await proseMirror.focus();
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type(text, { delay: 20 });
  }

  async getEditorContent(): Promise<string> {
    return this.milkdownEditor.textContent() || '';
  }

  async isConnected(): Promise<boolean> {
    const status = await this.connectionStatus.textContent();
    return status?.toLowerCase().includes('connected') || false;
  }

  async toggleSidebar() {
    const toggle = this.page.locator('[data-testid="sidebar-toggle"]');
    if (await toggle.isVisible()) await toggle.click();
  }
}
