import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = 'e2e-mobile@example.com';
const API = 'http://localhost:4000';

/** Viewports we care about: narrow phones, the 440px breakpoint either side, then tablet/desktop. */
const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: 'iphone-se',         width: 375, height: 667 },
  { name: 'iphone-pro-max',    width: 414, height: 896 },
  { name: 'just-below-440',    width: 439, height: 800 },
  { name: 'just-above-440',    width: 441, height: 800 },
  { name: 'tablet',            width: 768, height: 1024 },
  { name: 'desktop',           width: 1280, height: 800 },
];

/** A page whose body content exercises every prose construct that previously
 *  could push horizontal overflow: bare URL, wide code block, wide table.
 *  The page title (`WelcomeVisitors`) is also intentionally one unbreakable
 *  token — this was the original symptom case for #12. */
const OVERFLOW_FIXTURE = `Bare URL: https://example.org/another/extremely/long/path/that/should/wrap/inside/the/text/block.

\`\`\`
curl -X POST https://example.org/api/v1/widgets --header "Authorization: Bearer eyJlong.token.value.here.that.makes.this.line.way.too.wide.for.any.phone.viewport"
\`\`\`

| Col A | Col B | Col C | Col D | Col E | Col F | Col G | Col H |
|-------|-------|-------|-------|-------|-------|-------|-------|
| 1     | 2     | 3     | 4     | 5     | 6     | 7     | 8     |
| 9     | 10    | 11    | 12    | 13    | 14    | 15    | 16    |
`;

async function login(page: Page, email = TEST_EMAIL) {
  await page.request.post(`${API}/api/auth/login`, { data: { email } });
  const res = await page.request.get(`${API}/api/auth/test/last-magic-link`);
  const { url } = await res.json();
  await page.goto(url);
  await page.waitForURL('**/');
}

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `horizontal overflow: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth);
}

test.describe('Narrow-viewport layout', () => {
  test.describe.configure({ mode: 'serial' });

  // Each spec run gets a fresh wiki so we never collide with prior state.
  const wikiSlug = `e2e-mobile-${Date.now()}`;
  const wikiTitle = 'Mobile Viewport Test';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page);

    await page.request.post(`${API}/api/wikis`, {
      data: { slug: wikiSlug, title: wikiTitle, visibility: 'public' },
    });

    // Page 1: an unbreakable-token title — the original symptom case.
    await page.request.put(`${API}/api/wikis/${wikiSlug}/pages`, {
      data: {
        path: 'WelcomeVisitors.md',
        content: 'A page whose title is one unbreakable token.\n',
      },
    });

    // Page 2: rendered body content that exercises every prose construct.
    await page.request.put(`${API}/api/wikis/${wikiSlug}/pages`, {
      data: { path: 'OverflowScenarios.md', content: OVERFLOW_FIXTURE },
    });

    await page.close();
  });

  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px) — WikiHome has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.goto(`/${wikiSlug}`);
      await expect(page.locator('h1')).toContainText(wikiTitle);
      await expectNoHorizontalOverflow(page);
    });

    test(`${vp.name} (${vp.width}px) — PageView with long title has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.goto(`/${wikiSlug}/WelcomeVisitors`);
      await expect(page.locator('h1')).toContainText('WelcomeVisitors');
      await expectNoHorizontalOverflow(page);
    });

    test(`${vp.name} (${vp.width}px) — PageView with wide content has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.goto(`/${wikiSlug}/OverflowScenarios`);
      // Wait for the markdown to render, then assert structure is there.
      await expect(page.locator('.prose table')).toBeVisible();
      await expect(page.locator('.prose pre')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`${vp.name} (${vp.width}px) — PageEdit has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.goto(`/${wikiSlug}/WelcomeVisitors/edit`);
      await expect(page.locator('.cm-content')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
