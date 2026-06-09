import { test, expect } from '../fixtures/api.fixture';
import { AuthPage } from '../pages/auth.page';
import { HomePage } from '../pages/home.page';
import { EditorPage } from '../pages/editor.page';

test.describe('Documents', () => {
  // ────────────────────────────────────────────────
  // Create document
  // ────────────────────────────────────────────────

  test('create document via API appears in list', async ({ page, api }) => {
    const session = await api.register();
    const docId = await api.createDocument(session.accessToken, 'E2E Test Document');

    // Login via UI and verify document appears
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.login(session.user.username, session.user.password);
    await auth.expectRedirectedToHome();

    const home = new HomePage(page);
    await home.waitForLoaded();

    // Document title should be visible in the list
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await api.deleteUser(session.accessToken);
  });

  // ────────────────────────────────────────────────
  // Open document → Editor loads
  // ────────────────────────────────────────────────

  test('open document loads the editor', async ({ page, api }) => {
    const session = await api.register();
    const docId = await api.createDocument(session.accessToken, 'Editor Test Doc');

    // Login via UI
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.login(session.user.username, session.user.password);
    await auth.expectRedirectedToHome();

    // Click the edit button under the document card
    await page.locator('[aria-label="编辑"], [aria-label="Edit"]').first().click();
    await page.waitForURL(/\/editor\//);

    // Editor should load
    await page.waitForSelector('.milkdown', { timeout: 15_000 });

    // Cleanup
    await api.deleteUser(session.accessToken);
  });

  // ────────────────────────────────────────────────
  // Edit and save document content
  // ────────────────────────────────────────────────

  test('edit and save document content', async ({ page, api }) => {
    const session = await api.register();
    const docId = await api.createDocument(session.accessToken, 'Edit Test Doc');

    // Login and open document
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.login(session.user.username, session.user.password);
    await auth.expectRedirectedToHome();
    await page.locator('[aria-label="编辑"], [aria-label="Edit"]').first().click();
    await page.waitForURL(/\/editor\//);

    const editor = new EditorPage(page);
    await editor.waitForLoaded();

    // Type content and verify it appears in the editor (CRDT local state)
    const testText = 'Hello E2E Test!';
    await editor.typeInEditor(testText);

    // Verify content is visible in the editor (local CRDT state)
    const content = await editor.getEditorContent();
    expect(content).toContain(testText);

    // Cleanup
    await api.deleteUser(session.accessToken);
  });

  test('unauthenticated user redirected to login from document page', async ({ page, api }) => {
    const session = await api.register();
    const docId = await api.createDocument(session.accessToken, 'Private Doc');

    // Try to access without auth
    await page.goto(`/editor/${docId}`);
    // Should be redirected to login
    await page.waitForURL(/\/login/);

    // Cleanup
    await api.deleteUser(session.accessToken);
  });
});
