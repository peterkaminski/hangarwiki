import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderMarkdown } from './render.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_OVERFLOW_FIXTURE = readFileSync(
  join(HERE, '__fixtures__', 'mobile-overflow.md'),
  'utf8',
);

describe('renderMarkdown', () => {
  it('renders basic Markdown to HTML', async () => {
    const result = await renderMarkdown('# Hello\n\nWorld.');
    expect(result.html).toContain('<h1>Hello</h1>');
    expect(result.html).toContain('<p>World.</p>');
  });

  it('extracts frontmatter', async () => {
    const result = await renderMarkdown('---\ntitle: Test\ntags: [a, b]\n---\n\n# Content');
    expect(result.frontmatter).toContain('title: Test');
    expect(result.html).toContain('<h1>Content</h1>');
    // Frontmatter should not appear in the rendered HTML
    expect(result.html).not.toContain('title: Test');
  });

  it('transforms wikilinks into anchor tags', async () => {
    const result = await renderMarkdown('See [[My Page]] for details.');
    expect(result.html).toContain('<a');
    expect(result.html).toContain('My Page');
    expect(result.linkTargets).toEqual(['My Page']);
  });

  it('transforms wikilinks with display text', async () => {
    const result = await renderMarkdown('Check [[My Page|this page]] out.');
    expect(result.html).toContain('this page');
  });

  it('uses resolveLink to generate URLs', async () => {
    const result = await renderMarkdown('[[Known Page]] and [[Unknown Page]]', {
      resolveLink: (target) => target === 'Known Page' ? '/wiki/Known_Page' : null,
      wikiBasePath: '/wiki',
    });
    expect(result.html).toContain('href="/wiki/Known_Page"');
    expect(result.html).toContain('wikilink-new'); // Unknown page gets "new" class
  });

  it('transforms image embeds into img tags', async () => {
    const result = await renderMarkdown('![[photo.png]]', {
      wikiBasePath: '/wiki',
    });
    expect(result.html).toContain('<img');
    expect(result.html).toContain('_attachments/photo.png');
  });

  it('transforms image embeds with alt text', async () => {
    const result = await renderMarkdown('![[photo.png|My Photo]]', {
      wikiBasePath: '/wiki',
    });
    expect(result.html).toContain('alt="My Photo"');
  });

  it('transforms page embeds into transclusion placeholders', async () => {
    const result = await renderMarkdown('![[Embedded Page]]');
    expect(result.html).toContain('transclusion');
    expect(result.html).toContain('Embedded Page');
  });

  it('handles mixed content', async () => {
    const content = `---
title: Mixed
---

# Welcome

See [[Page A]] and [[Page B|page B]].

![[diagram.png|Architecture]]

Regular **bold** and *italic*.
`;
    const result = await renderMarkdown(content, { wikiBasePath: '/w' });
    expect(result.frontmatter).toContain('title: Mixed');
    expect(result.html).toContain('<h1>Welcome</h1>');
    expect(result.html).toContain('Page A');
    expect(result.html).toContain('page B');
    expect(result.html).toContain('diagram.png');
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.linkTargets).toEqual(['Page A', 'Page B']);
  });

  it('sanitizes dangerous HTML', async () => {
    const result = await renderMarkdown('<script>alert("xss")</script>\n\n# Safe');
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('<h1>Safe</h1>');
  });

  describe('GFM features', () => {
    it('renders pipe tables as <table>', async () => {
      const result = await renderMarkdown(
        '| A | B |\n|---|---|\n| 1 | 2 |\n',
      );
      expect(result.html).toContain('<table>');
      expect(result.html).toContain('<th>A</th>');
      expect(result.html).toContain('<td>1</td>');
    });

    it('autolinks bare URLs in paragraphs', async () => {
      const result = await renderMarkdown(
        'See https://example.org/path for details.',
      );
      expect(result.html).toContain(
        '<a href="https://example.org/path">https://example.org/path</a>',
      );
    });

    it('renders fenced code blocks as <pre><code>', async () => {
      const result = await renderMarkdown('```\nhello world\n```\n');
      expect(result.html).toMatch(/<pre><code[^>]*>hello world\n<\/code><\/pre>/);
    });

    it('renders strikethrough as <del>', async () => {
      const result = await renderMarkdown('~~struck~~');
      expect(result.html).toContain('<del>struck</del>');
    });

    it('renders task lists', async () => {
      const result = await renderMarkdown('- [ ] todo\n- [x] done\n');
      expect(result.html).toContain('type="checkbox"');
      expect(result.html).toContain('disabled');
    });
  });

  describe('mobile-overflow fixture', () => {
    // The fixture exercises every prose construct that previously caused
    // narrow-viewport overflow (see #12, #14): bare URLs, long anchor text,
    // wide code blocks, wide tables, plus strikethrough as a GFM canary.
    // This test pins the output structure; the layout/visual side of the
    // same scenarios is covered by Playwright tests (#16).
    it('renders without throwing', async () => {
      const result = await renderMarkdown(MOBILE_OVERFLOW_FIXTURE);
      expect(result.html).toBeTruthy();
    });

    it('produces the expected GFM constructs', async () => {
      const result = await renderMarkdown(MOBILE_OVERFLOW_FIXTURE);
      // Table from the wide-table section
      expect(result.html).toContain('<table>');
      expect(result.html).toContain('<th>Col A</th>');
      // Autolink from the bare URL paragraph
      expect(result.html).toMatch(
        /<a href="https:\/\/example\.org\/another\/extremely\/long\/path[^"]*">/,
      );
      // Fenced code block
      expect(result.html).toContain('<pre><code');
      // Strikethrough
      expect(result.html).toContain('<del>');
      // Wikilink with display text (also exercised in fixture)
      expect(result.linkTargets).toContain('Should Exist');
    });
  });
});
