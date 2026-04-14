import { renderMarkdown as sharedRender } from '@hangarwiki/shared';
import { pages as pagesApi, type PageInfo } from './api';

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

const MAX_TRANSCLUSION_DEPTH = 3;

/**
 * Resolve transclusion placeholders in rendered HTML by fetching and rendering
 * the embedded page content. Prevents infinite loops via depth tracking.
 */
export async function resolveTransclusions(
  html: string,
  wikiSlug: string,
  existingPages: PageInfo[],
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<string> {
  if (depth >= MAX_TRANSCLUSION_DEPTH) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const placeholders = doc.querySelectorAll('.transclusion[data-target]');
  if (placeholders.length === 0) return html;

  for (const el of placeholders) {
    const target = el.getAttribute('data-target')!;
    const targetLower = target.toLowerCase();

    // Circular reference check
    if (visited.has(targetLower)) {
      el.innerHTML = `<em class="text-gray-400">Circular transclusion: ${target}</em>`;
      continue;
    }

    // Find the page by title (case-insensitive)
    const match = existingPages.find((p) => {
      if (p.title.toLowerCase() === targetLower) return true;
      const filename = p.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
      return filename.toLowerCase() === targetLower;
    });

    if (!match) {
      el.innerHTML = `<em class="text-gray-400">Page not found: ${target}</em>`;
      continue;
    }

    try {
      const { page } = await pagesApi.get(wikiSlug, match.urlPath);
      const innerVisited = new Set(visited);
      innerVisited.add(targetLower);

      let rendered = await renderMarkdown(page.content, `/${wikiSlug}`, existingPages);
      rendered = await resolveTransclusions(rendered, wikiSlug, existingPages, innerVisited, depth + 1);

      // Replace placeholder with a styled transclusion block
      const wrapper = doc.createElement('div');
      wrapper.className = 'transclusion-content border-l-2 border-gray-200 pl-4 my-4';
      wrapper.setAttribute('data-source', match.path);
      wrapper.innerHTML = rendered;
      el.replaceWith(wrapper);
    } catch {
      el.innerHTML = `<em class="text-gray-400">Failed to load: ${target}</em>`;
    }
  }

  return doc.body.innerHTML;
}
