/**
 * Wikilink parser and extractor.
 * Handles [[Page Name]], [[Page Name|display text]], and ![[embed]] syntax.
 */

export interface WikilinkToken {
  /** The full match text including brackets. */
  raw: string;
  /** The target page name (before the | if present). */
  target: string;
  /** The display text (after the | if present, otherwise same as target). */
  display: string;
  /** Whether this is an embed (![[...]]) vs a regular link ([[...]]). */
  isEmbed: boolean;
  /** Start index in the source string. */
  start: number;
  /** End index in the source string. */
  end: number;
}

// Matches [[target]], [[target|display]], ![[target]], ![[target|display]]
const WIKILINK_RE = /(!?)\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Extract all wikilinks from a Markdown string. */
export function extractWikilinks(content: string): WikilinkToken[] {
  const tokens: WikilinkToken[] = [];
  let match: RegExpExecArray | null;

  // Reset the regex state
  WIKILINK_RE.lastIndex = 0;

  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const [raw, embed, target, display] = match;
    tokens.push({
      raw,
      target: target.trim(),
      display: (display ?? target).trim(),
      isEmbed: embed === '!',
      start: match.index,
      end: match.index + raw.length,
    });
  }

  return tokens;
}

/** Get unique page targets from wikilinks (non-embed links only). */
export function extractLinkTargets(content: string): string[] {
  const links = extractWikilinks(content).filter((t) => !t.isEmbed);
  return [...new Set(links.map((t) => t.target))];
}

/** Get unique embed targets from wikilinks (embed links only). */
export function extractEmbedTargets(content: string): string[] {
  const embeds = extractWikilinks(content).filter((t) => t.isEmbed);
  return [...new Set(embeds.map((t) => t.target))];
}

/** Image file extensions that should render as images when embedded. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

/** Check if an embed target is an image (by file extension). */
export function isImageEmbed(target: string): boolean {
  const ext = target.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}
