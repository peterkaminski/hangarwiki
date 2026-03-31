import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import type { Root, Text, Link } from 'mdast';
import { extractWikilinks, isImageEmbed, type WikilinkToken } from './wikilink.js';

export interface RenderOptions {
  /** Function to resolve a wikilink target to a URL path. */
  resolveLink?: (target: string) => string | null;
  /** Base URL path for the wiki (e.g., "/my-wiki"). */
  wikiBasePath?: string;
}

export interface RenderResult {
  /** Rendered HTML string. */
  html: string;
  /** Extracted frontmatter (raw YAML string, if present). */
  frontmatter?: string;
  /** Outgoing wikilink targets found in the content. */
  linkTargets: string[];
}

/**
 * Custom remark plugin that transforms wikilink syntax into standard Markdown
 * links/images before the remark-rehype bridge.
 */
function remarkWikilinks(options: RenderOptions = {}) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;

      const tokens = extractWikilinks(node.value);
      if (tokens.length === 0) return;

      // Build replacement nodes
      const children: (Text | Link | any)[] = [];
      let lastEnd = 0;

      for (const token of tokens) {
        // Text before this wikilink
        if (token.start > lastEnd) {
          children.push({
            type: 'text',
            value: node.value.slice(lastEnd, token.start),
          });
        }

        if (token.isEmbed && isImageEmbed(token.target)) {
          // Image embed: ![[image.png]] -> <img>
          const basePath = options.wikiBasePath ?? '';
          children.push({
            type: 'image',
            url: `${basePath}/_attachments/${token.target}`,
            alt: token.display,
          });
        } else if (token.isEmbed) {
          // Page embed: ![[Page]] -> placeholder paragraph (transclusion resolved later)
          children.push({
            type: 'paragraph',
            children: [{ type: 'text', value: `[Transcluded: ${token.display}]` }],
            data: {
              hProperties: {
                class: 'transclusion',
                'data-target': token.target,
              },
            },
          });
        } else {
          // Regular wikilink: [[Page]] -> <a href="...">
          const resolved = options.resolveLink?.(token.target);
          const href = resolved ?? `${options.wikiBasePath ?? ''}/${encodeURIComponent(token.target)}`;

          const classes = resolved ? 'wikilink' : 'wikilink wikilink-new';
          children.push({
            type: 'link',
            url: href,
            children: [{ type: 'text', value: token.display }],
            data: {
              hProperties: { class: classes },
            },
          });
        }

        lastEnd = token.end;
      }

      // Text after the last wikilink
      if (lastEnd < node.value.length) {
        children.push({
          type: 'text',
          value: node.value.slice(lastEnd),
        });
      }

      // Replace the text node with the new children
      parent.children.splice(index, 1, ...children);
    });
  };
}

/** Render Markdown with wikilink support to HTML. */
export async function renderMarkdown(
  content: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  // Extract link targets before rendering
  const wikilinks = extractWikilinks(content);
  const linkTargets = [...new Set(
    wikilinks.filter((t) => !t.isEmbed).map((t) => t.target),
  )];

  // Customize sanitization to allow our wikilink classes and transclusion elements
  // rehype-sanitize uses [attrName, ...allowedValues] format for value-restricted attrs
  const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'div'],
    attributes: {
      ...defaultSchema.attributes,
      a: [...(defaultSchema.attributes?.a ?? []), ['class', 'wikilink', 'wikilink-new', 'wikilink wikilink-new']],
      p: [...(defaultSchema.attributes?.p ?? []), ['class', 'transclusion'], 'data-target'],
    },
  };

  let frontmatter: string | undefined;

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(() => (tree: Root) => {
      // Extract frontmatter
      visit(tree, 'yaml', (node: any) => {
        frontmatter = node.value;
      });
    })
    .use(remarkWikilinks, options)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const result = await processor.process(content);

  return {
    html: String(result),
    frontmatter,
    linkTargets,
  };
}
