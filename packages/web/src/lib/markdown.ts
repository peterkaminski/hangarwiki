import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// Simple client-side renderer. For the full wikilink-aware pipeline,
// we'll eventually import from @hangarwiki/shared. For now, this handles
// basic Markdown rendering with frontmatter stripping and XSS sanitization.

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ['class', 'wikilink', 'wikilink-new', 'wikilink wikilink-new']],
    p: [...(defaultSchema.attributes?.p ?? []), ['class', 'transclusion'], 'data-target'],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSanitize, sanitizeSchema as any)
  .use(rehypeStringify);

/** Render Markdown to HTML (client-side, basic — no wikilink resolution). */
export async function renderMarkdown(content: string, _wikiBasePath?: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}
