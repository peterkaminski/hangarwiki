import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render.js';

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
});
