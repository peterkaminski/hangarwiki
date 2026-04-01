import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = 'e2e-test@example.com';
const API = 'http://localhost:4000';

/** Log in via magic link and return the authenticated page. */
async function login(page: Page, email = TEST_EMAIL) {
  // Request magic link
  await page.request.post(`${API}/api/auth/login`, {
    data: { email },
  });

  // Get the verify URL from the test endpoint
  const res = await page.request.get(`${API}/api/auth/test/last-magic-link`);
  const { url } = await res.json();

  // Visit the verify URL — this sets the session cookie and redirects
  await page.goto(url);
  await page.waitForURL('**/');
}

test.describe('End-to-end wiki flow', () => {
  test.describe.configure({ mode: 'serial' });

  const wikiSlug = `e2e-test-${Date.now()}`;
  const wikiTitle = 'E2E Test Wiki';

  test('login via magic link', async ({ page }) => {
    await login(page);

    // Should see the wiki list page
    await expect(page.locator('h1')).toContainText('Your Wikis');

    // Should show the user in the nav
    await expect(page.locator('nav')).toContainText('e2e-test');
  });

  test('create a wiki', async ({ page }) => {
    await login(page);

    // Click "New Wiki"
    await page.click('text=New Wiki');

    // Fill in the title (slug auto-generates)
    await page.fill('input[placeholder="Wiki title"]', wikiTitle);

    // Override slug to be unique — the slug input is inside a flex container after "Slug:" label
    const slugInput = page.locator('.gap-2 input[type="text"]');
    await slugInput.clear();
    await slugInput.fill(wikiSlug);

    // Submit
    await page.click('button:text("Create")');

    // Should navigate to the new wiki
    await page.waitForURL(`**/${wikiSlug}`);
    await expect(page.locator('h1')).toContainText(wikiTitle);
  });

  test('create a page', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}`);

    // Click "New Page"
    await page.click('text=New Page');
    await page.waitForURL(`**/${wikiSlug}/_new`);

    // Fill in the title and content
    await page.fill('input[placeholder="Page title"]', 'Hello World');
    // Type into CodeMirror
    await page.click('.cm-content');
    await page.keyboard.type('This is a test page with a link to [[Sandbox]].');

    // Save
    await page.click('button:text("Save")');
    await page.waitForURL(`**/${wikiSlug}/Hello_World`);

    // Should show the rendered page
    await expect(page.locator('h1')).toContainText('Hello World');
    await expect(page.locator('.prose')).toContainText('This is a test page');
  });

  test('edit a page', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Hello_World`);

    // Click Edit
    await page.click('text=Edit');
    await page.waitForURL(`**/${wikiSlug}/Hello_World/edit`);

    // Add content to CodeMirror — select all and replace with updated text
    await page.click('.cm-content');
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('This is a test page with a link to [[Sandbox]].\n\nAdded during e2e test.');

    // Save
    await page.click('button:text("Save")');
    await page.waitForURL(`**/${wikiSlug}/Hello_World`);

    await expect(page.locator('.prose')).toContainText('Added during e2e test');
  });

  test('view page history', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Hello_World`);

    await page.click('text=History');
    await page.waitForURL(`**/${wikiSlug}/Hello_World/history`);

    // Should show at least 2 commits (create + edit)
    const entries = page.locator('.space-y-2 > div');
    await expect(entries).toHaveCount(2, { timeout: 5000 });
  });

  test('wikilinks render and navigate', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Hello_World`);

    // Should have a wikilink for Sandbox (incipient)
    const link = page.locator('a.wikilink-new, a[data-incipient]').first();
    await expect(link).toBeVisible();
  });

  test('create linked page from incipient link', async ({ page }) => {
    await login(page);

    // First, make sure the wiki uses 'create' mode for incipient links
    const res = await page.request.get(`${API}/api/wikis/${wikiSlug}`);
    const { wiki } = await res.json();

    if (wiki.incipientLinkStyle !== 'create') {
      await page.request.fetch(`${API}/api/wikis/${wikiSlug}`, {
        method: 'PATCH',
        data: { incipientLinkStyle: 'create' },
      });
    }

    await page.goto(`/${wikiSlug}/Hello_World`);

    // Click the incipient link to Sandbox
    const link = page.locator('.prose a:has-text("Sandbox")').first();
    await link.click();

    // Should go to the new page form with title pre-filled
    await page.waitForURL(`**/${wikiSlug}/_new?title=Sandbox`);

    // Title should be pre-filled
    await expect(page.locator('input[placeholder="Page title"]')).toHaveValue('Sandbox');

    // Type content and save
    await page.click('.cm-content');
    await page.keyboard.type('This is the sandbox page.');
    await page.click('button:text("Save")');

    await page.waitForURL(`**/${wikiSlug}/Sandbox`);
    await expect(page.locator('.prose')).toContainText('This is the sandbox page');
  });

  test('backlinks appear after page creation', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Sandbox`);

    // Sandbox should show Hello World as a backlink
    await expect(page.locator('text=Pages that link here')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a:has-text("Hello World")')).toBeVisible();
  });

  test('wiki settings page works', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}`);

    await page.click('text=Settings');
    await page.waitForURL(`**/${wikiSlug}/_settings`);

    await expect(page.locator('h1')).toContainText('Wiki Settings');

    // Change the title
    const titleInput = page.locator('#title');
    await titleInput.clear();
    await titleInput.fill(`${wikiTitle} Updated`);
    await page.click('button:text("Save Settings")');

    await expect(page.locator('text=Settings saved')).toBeVisible();

    // Verify the change persisted
    await page.goto(`/${wikiSlug}`);
    await expect(page.locator('h1')).toContainText(`${wikiTitle} Updated`);
  });

  test('user settings page works', async ({ page }) => {
    await login(page);

    // Click username in nav to go to settings
    await page.locator('nav a:has-text("e2e-test")').click();
    await page.waitForURL('**/settings');

    await expect(page.locator('h1')).toContainText('Account Settings');

    // Update display name
    const nameInput = page.locator('#displayName');
    await nameInput.clear();
    await nameInput.fill('E2E Tester');
    await page.click('button:text("Save")');

    await expect(page.locator('text=Saved')).toBeVisible();

    // Nav should update
    await expect(page.locator('nav')).toContainText('E2E Tester');
  });

  test('cancel editing returns to page', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Hello_World/edit`);

    await page.click('button:text("Cancel")');
    await page.waitForURL(`**/${wikiSlug}/Hello_World`);
  });

  test('client-side navigation between pages (no full reload)', async ({ page }) => {
    await login(page);
    await page.goto(`/${wikiSlug}/Hello_World`);
    await page.waitForSelector('.prose');

    // Navigate to Sandbox via wikilink
    await page.click('.prose a:has-text("Sandbox")');
    await page.waitForURL(`**/${wikiSlug}/Sandbox`);

    // Should show content without flash
    await expect(page.locator('.prose')).toContainText('sandbox page');
  });

  test('unauthenticated user cannot edit', async ({ page }) => {
    // Don't log in — just visit a page
    await page.goto(`/${wikiSlug}/Hello_World`);

    // Edit button should not be visible
    await expect(page.locator('a:text("Edit")')).not.toBeVisible();
  });
});
