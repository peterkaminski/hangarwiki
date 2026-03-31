/**
 * MarkPub-style path scrubbing.
 * Replaces runs of [ _ ? # % "] with a single underscore.
 * Preserves: commas, colons, periods, hyphens, parens.
 */
const SCRUB_RE = /[ _?#%"]+/g;

/** Convert a page file path to a URL-safe slug. */
export function scrubPath(filepath: string): string {
  return filepath.replace(SCRUB_RE, '_');
}

/** Convert a page title to a filename (with .md extension). */
export function titleToFilename(title: string): string {
  return `${title}.md`;
}

/** Extract a page title from a filename (strip .md extension). */
export function filenameToTitle(filename: string): string {
  return filename.replace(/\.md$/, '');
}

/** Convert a page file path to a URL path segment. */
export function filePathToUrlPath(filePath: string): string {
  // Strip .md extension, then scrub
  const withoutExt = filePath.replace(/\.md$/, '');
  return scrubPath(withoutExt);
}

/** Convert a URL path segment back to a potential file path for lookup. */
export function urlPathToSearchPattern(urlPath: string): string {
  // Underscores in URLs could be spaces or underscores in the original filename.
  // We do case-insensitive search against the page index.
  return urlPath.replace(/_/g, ' ') + '.md';
}

/**
 * Resolve a wikilink target to a file path.
 * Searches the provided page list for a case-insensitive match.
 * If the link contains a `/`, it's treated as a folder-qualified path.
 * Otherwise, searches all folders — closest folder first (relative to `fromDir`),
 * then non-deterministic among remaining matches.
 */
export function resolveWikilink(
  target: string,
  pages: string[],
  fromDir = '',
): string | null {
  const targetLower = target.toLowerCase().trim();

  // If target contains a slash, match against the full relative path (minus .md)
  if (targetLower.includes('/')) {
    const match = pages.find(
      (p) => p.replace(/\.md$/, '').toLowerCase() === targetLower,
    );
    return match ?? null;
  }

  // Match by filename stem only (case-insensitive)
  const matches = pages.filter((p) => {
    const stem = p.split('/').pop()?.replace(/\.md$/, '').toLowerCase();
    return stem === targetLower;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches: prefer closest folder to `fromDir`
  if (fromDir) {
    const fromParts = fromDir.split('/').filter(Boolean);
    const scored = matches.map((m) => {
      const mParts = m.split('/').slice(0, -1); // directory parts
      let common = 0;
      for (let i = 0; i < Math.min(fromParts.length, mParts.length); i++) {
        if (fromParts[i] === mParts[i]) common++;
        else break;
      }
      return { path: m, score: common };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].path;
  }

  // No fromDir context: return first match (non-deterministic)
  return matches[0];
}
