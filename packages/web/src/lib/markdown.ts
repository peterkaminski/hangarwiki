import { renderMarkdown as sharedRender } from '@hangarwiki/shared';
import type { PageInfo } from './api';

/** Render Markdown to HTML with wikilink support and link resolution. */
export async function renderMarkdown(
  content: string,
  wikiBasePath?: string,
  existingPages?: PageInfo[],
): Promise<string> {
  const resolveLink = existingPages
    ? (target: string) => {
        const normalized = target.toLowerCase();
        const match = existingPages.find((p) => {
          // Match against title (case-insensitive)
          if (p.title.toLowerCase() === normalized) return true;
          // Match against filename without extension
          const filename = p.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
          if (filename.toLowerCase() === normalized) return true;
          return false;
        });
        return match ? `${wikiBasePath}/${match.urlPath}` : null;
      }
    : undefined;

  const result = await sharedRender(content, { wikiBasePath, resolveLink });
  return result.html;
}
