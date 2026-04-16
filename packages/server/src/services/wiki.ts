import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { users, wikis, wikiMembers, pageIndex, pageLinks } from '../db/schema.js';
import { and } from 'drizzle-orm';
import { extractLinkTargets } from '@hangarwiki/shared';
import { GitService, type GitAuthor } from './git.js';
import { ForgeClient } from './forge.js';
import { gitSshCommand, getServerPublicKey } from './ssh.js';
import { filenameToTitle, filePathToUrlPath } from './paths.js';

export interface WikiInfo {
  id: string;
  slug: string;
  title: string;
  visibility: 'public' | 'private';
  incipientLinkStyle: 'create' | 'highlight';
  sourceUrl?: string | null;
}

export interface PageInfo {
  path: string;
  title: string;
  urlPath: string;
}

export interface PageContent {
  path: string;
  title: string;
  content: string;
  urlPath: string;
}

export interface PageHistoryEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}

/** Get the local git repo path for a wiki. */
function wikiRepoPath(slug: string): string {
  return join(config.dataDir, 'repos', slug);
}

/** Push to remote in the background. Logs errors but doesn't block the caller. */
function pushInBackground(slug: string): void {
  const git = getWikiGit(slug);
  git.push().catch((err) => {
    // Push failures are non-fatal — the commit is safe locally
    console.error(`Background push failed for "${slug}":`, err);
  });
}

/** Get a GitService for a wiki, configured with the server's SSH key. */
export function getWikiGit(slug: string): GitService {
  const git = new GitService(wikiRepoPath(slug));
  git.setEnv({ GIT_SSH_COMMAND: gitSshCommand() });
  return git;
}

/** Create a new wiki. */
export async function createWiki(
  slug: string,
  title: string,
  ownerId: string,
  visibility: 'public' | 'private' = 'public',
): Promise<WikiInfo> {
  const db = getDb();
  const id = nanoid();

  // Create the wiki record
  db.insert(wikis).values({
    id,
    slug,
    title,
    forgeOwner: '', // Will be set after Forge repo creation
    forgeRepo: '',
    visibility,
  }).run();

  // Add owner as member
  db.insert(wikiMembers).values({
    id: nanoid(),
    wikiId: id,
    userId: ownerId,
    role: 'owner',
    acceptedAt: new Date().toISOString(),
  }).run();

  // Initialize local git repo
  const git = getWikiGit(slug);
  await git.init();
  await git.setConfig('user.name', 'HangarWiki');
  await git.setConfig('user.email', 'wiki@hangarwiki.local');

  // Create initial files
  await git.writeFile('_home.md', `# ${title}\n\nWelcome to ${title}!\n`);
  await git.writeFile('.hangarwiki.json', JSON.stringify({ title, visibility }, null, 2) + '\n');
  await git.add('.');
  await git.commit('Initialize wiki', { name: 'HangarWiki', email: 'wiki@hangarwiki.local' });

  // Connect to Forgejo if API token is configured
  if (config.forgeApiToken) {
    try {
      await connectWikiToForge(slug, title, visibility === 'private');
    } catch (err) {
      console.error(`Failed to connect wiki "${slug}" to Forgejo:`, err);
      // Wiki is still usable locally without Forgejo
    }
  }

  return { id, slug, title, visibility, incipientLinkStyle: 'create' as const };
}

/**
 * Create a Forgejo repo for a wiki, add it as a remote, and register a push webhook.
 */
async function connectWikiToForge(
  slug: string,
  title: string,
  isPrivate: boolean,
): Promise<void> {
  const forge = new ForgeClient();
  const currentUser = await forge.getCurrentUser();

  // Create the Forgejo repo
  const repo = await forge.createRepo(slug, {
    description: `HangarWiki: ${title}`,
    private: isPrivate,
  });

  // Register the server's public key as a deploy key (read-write)
  const pubKey = await getServerPublicKey();
  await forge.addDeployKey(currentUser.login, slug, `hangarwiki-server-${slug}`, pubKey, false);

  // Store forge owner/repo in DB
  const db = getDb();
  db.update(wikis)
    .set({ forgeOwner: currentUser.login, forgeRepo: slug })
    .where(eq(wikis.slug, slug))
    .run();

  // Add Forgejo as the remote using SSH URL (authenticated via deploy key)
  const git = getWikiGit(slug);
  await git.addRemote('origin', repo.ssh_url);

  // Push the initial commit
  await git.push();

  // Register webhook if secret is configured
  if (config.webhookSecret) {
    const webhookUrl = `${config.serverUrl}/api/webhooks/push`;
    await forge.createWebhook(currentUser.login, slug, webhookUrl, config.webhookSecret);
  }
}

/** Import a wiki from an existing git repository URL. */
export async function importWiki(
  url: string,
  slug: string,
  title: string,
  ownerId: string,
  visibility: 'public' | 'private' = 'public',
): Promise<WikiInfo> {
  const db = getDb();
  const id = nanoid();

  // Clone the remote repo
  const git = getWikiGit(slug);
  await git.clone(url);

  // Capture fork point before reconfiguring remotes
  const forkCommit = await git.getHead();
  const forkedAt = new Date().toISOString();

  // Set local git config for future commits
  await git.setConfig('user.name', 'HangarWiki');
  await git.setConfig('user.email', 'wiki@hangarwiki.local');

  // Rename the source remote to "upstream" and connect to local Forge as "origin"
  await git.renameRemote('origin', 'upstream');

  // Create the wiki record
  db.insert(wikis).values({
    id,
    slug,
    title,
    forgeOwner: '',
    forgeRepo: '',
    visibility,
    sourceUrl: url,
    sourceForkedAt: forkedAt,
    sourceForkCommit: forkCommit,
  }).run();

  // Add owner as member
  db.insert(wikiMembers).values({
    id: nanoid(),
    wikiId: id,
    userId: ownerId,
    role: 'owner',
    acceptedAt: new Date().toISOString(),
  }).run();

  // Connect to Forgejo if API token is configured
  if (config.forgeApiToken) {
    try {
      await connectWikiToForge(slug, title, visibility === 'private');
    } catch (err) {
      console.error(`Failed to connect imported wiki "${slug}" to Forgejo:`, err);
      // Wiki is still usable locally without Forgejo
    }
  }

  // Index all wikilinks in existing pages
  await indexAllPageLinks(slug);

  return { id, slug, title, visibility, incipientLinkStyle: 'create' as const, sourceUrl: url };
}

/** Scan all markdown pages in a wiki and populate the page_links table. */
export async function indexAllPageLinks(wikiSlug: string): Promise<number> {
  const pages = await listPages(wikiSlug);
  const git = getWikiGit(wikiSlug);
  let count = 0;

  for (const page of pages) {
    try {
      const content = await git.readFile(page.path);
      await updatePageLinks(wikiSlug, page.path, content);
      await updateSearchIndex(wikiSlug, page.path, content);
      count++;
    } catch {
      // Skip unreadable files
    }
  }

  return count;
}

/** List all wikis the user has access to. */
export async function listWikis(userId: string): Promise<WikiInfo[]> {
  const db = getDb();
  const memberships = db.select()
    .from(wikiMembers)
    .innerJoin(wikis, eq(wikiMembers.wikiId, wikis.id))
    .where(eq(wikiMembers.userId, userId))
    .all();

  return memberships.map((m) => ({
    id: m.wikis.id,
    slug: m.wikis.slug,
    title: m.wikis.title,
    visibility: m.wikis.visibility as 'public' | 'private',
    incipientLinkStyle: (m.wikis.incipientLinkStyle as 'create' | 'highlight') ?? 'create',
    sourceUrl: m.wikis.sourceUrl,
  }));
}

/** Get a wiki by slug. */
export async function getWiki(slug: string): Promise<WikiInfo | null> {
  const db = getDb();
  const wiki = db.select().from(wikis).where(eq(wikis.slug, slug)).get();
  if (!wiki) return null;
  return {
    id: wiki.id,
    slug: wiki.slug,
    title: wiki.title,
    visibility: wiki.visibility as 'public' | 'private',
    incipientLinkStyle: (wiki.incipientLinkStyle as 'create' | 'highlight') ?? 'create',
    sourceUrl: wiki.sourceUrl,
  };
}

/** Update wiki settings. Only title, visibility, and incipientLinkStyle are updatable. */
export async function updateWiki(
  slug: string,
  updates: { title?: string; visibility?: 'public' | 'private'; incipientLinkStyle?: 'create' | 'highlight' },
): Promise<WikiInfo | null> {
  const db = getDb();
  const wiki = db.select().from(wikis).where(eq(wikis.slug, slug)).get();
  if (!wiki) return null;

  const values: Record<string, unknown> = {};
  if (updates.title !== undefined) values.title = updates.title;
  if (updates.visibility !== undefined) values.visibility = updates.visibility;
  if (updates.incipientLinkStyle !== undefined) values.incipientLinkStyle = updates.incipientLinkStyle;

  if (Object.keys(values).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.update(wikis).set(values as any).where(eq(wikis.slug, slug)).run();
  }

  return getWiki(slug);
}

/** Delete a wiki and all associated data (DB rows, Forgejo repo, local git repo). */
export async function deleteWiki(slug: string): Promise<void> {
  const db = getDb();
  const wiki = db.select().from(wikis).where(eq(wikis.slug, slug)).get();
  if (!wiki) throw new Error('Wiki not found');

  // Delete Forgejo repo if connected
  if (wiki.forgeOwner && wiki.forgeRepo) {
    try {
      const forge = new ForgeClient();
      await forge.deleteRepo(wiki.forgeOwner, wiki.forgeRepo);
    } catch (err) {
      console.error(`Failed to delete Forgejo repo for wiki "${slug}":`, err);
      // Continue with local cleanup even if Forge is unreachable
    }
  }

  // Delete DB rows in FK-safe order
  const sqlite = (db as any).session.client as import('better-sqlite3').Database;
  sqlite.prepare('DELETE FROM page_fts WHERE wiki_id = ?').run(wiki.id);
  db.delete(pageLinks).where(eq(pageLinks.wikiId, wiki.id)).run();
  db.delete(pageIndex).where(eq(pageIndex.wikiId, wiki.id)).run();
  db.delete(wikiMembers).where(eq(wikiMembers.wikiId, wiki.id)).run();
  db.delete(wikis).where(eq(wikis.id, wiki.id)).run();

  // Delete local git repo
  const repoPath = wikiRepoPath(slug);
  rmSync(repoPath, { recursive: true, force: true });
}

/** Check if a user has at least the given role on a wiki. */
export async function checkAccess(
  wikiSlug: string,
  userId: string | undefined,
  requiredRole: 'viewer' | 'editor' | 'owner',
): Promise<boolean> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return false;

  // Public wikis allow viewing without auth
  if (wiki.visibility === 'public' && requiredRole === 'viewer') return true;

  if (!userId) return false;

  const db = getDb();
  const membership = db.select()
    .from(wikiMembers)
    .where(eq(wikiMembers.wikiId, wiki.id))
    .all()
    .find((m) => m.userId === userId);

  if (!membership) {
    // Public wikis auto-grant editor access to any authenticated user
    if (wiki.visibility === 'public' && requiredRole !== 'owner') {
      // Verify the user exists before creating membership
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      if (user) {
        db.insert(wikiMembers).values({
          id: nanoid(),
          wikiId: wiki.id,
          userId,
          role: 'editor',
          acceptedAt: new Date().toISOString(),
        }).run();
        return true;
      }
    }
    return false;
  }

  const roleHierarchy = { viewer: 0, editor: 1, owner: 2 };
  return roleHierarchy[membership.role as keyof typeof roleHierarchy] >= roleHierarchy[requiredRole];
}

/** List all pages in a wiki. */
export async function listPages(wikiSlug: string): Promise<PageInfo[]> {
  const git = getWikiGit(wikiSlug);
  const files = await git.listFiles();

  return files
    .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
    .map((f) => ({
      path: f,
      title: filenameToTitle(f.split('/').pop()!),
      urlPath: filePathToUrlPath(f),
    }));
}

/** Get a page's content. */
export async function getPage(wikiSlug: string, pagePath: string): Promise<PageContent | null> {
  const git = getWikiGit(wikiSlug);
  try {
    const content = await git.readFile(pagePath);
    return {
      path: pagePath,
      title: filenameToTitle(pagePath.split('/').pop()!),
      content,
      urlPath: filePathToUrlPath(pagePath),
    };
  } catch {
    return null;
  }
}

/** Create or update a page. */
export async function savePage(
  wikiSlug: string,
  pagePath: string,
  content: string,
  author: GitAuthor,
  commitMessage?: string,
): Promise<PageContent> {
  const git = getWikiGit(wikiSlug);

  // Check if this is a new page or an update
  let isNew = true;
  try {
    await git.readFile(pagePath);
    isNew = false;
  } catch {
    // File doesn't exist — new page
  }

  await git.writeFile(pagePath, content);
  await git.add(pagePath);

  const message = commitMessage ?? (isNew ? `Create ${pagePath}` : `Update ${pagePath}`);
  await git.commit(message, author);
  pushInBackground(wikiSlug);

  // Extract and store wikilinks
  await updatePageLinks(wikiSlug, pagePath, content);

  // Update full-text search index
  await updateSearchIndex(wikiSlug, pagePath, content);

  return {
    path: pagePath,
    title: filenameToTitle(pagePath.split('/').pop()!),
    content,
    urlPath: filePathToUrlPath(pagePath),
  };
}

/** Save an attachment (binary file) to the wiki's _attachments directory. */
export async function saveAttachment(
  wikiSlug: string,
  filename: string,
  data: Buffer,
  author: GitAuthor,
): Promise<{ path: string; url: string }> {
  const git = getWikiGit(wikiSlug);

  // Sanitize filename: strip path traversal, collapse special chars
  const sanitized = filename
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const attachmentPath = `_attachments/${sanitized}`;
  await git.writeBinaryFile(attachmentPath, data);
  await git.add(attachmentPath);
  await git.commit(`Upload ${sanitized}`, author);
  pushInBackground(wikiSlug);

  return {
    path: attachmentPath,
    url: `/${wikiSlug}/_attachments/${sanitized}`,
  };
}

/** Delete a page. */
export async function deletePage(
  wikiSlug: string,
  pagePath: string,
  author: GitAuthor,
): Promise<void> {
  const git = getWikiGit(wikiSlug);
  await git.deleteFile(pagePath);
  await git.commit(`Delete ${pagePath}`, author);
  pushInBackground(wikiSlug);

  // Clean up stored links and search index
  const wiki = await getWiki(wikiSlug);
  if (wiki) {
    const db = getDb();
    db.delete(pageLinks)
      .where(and(eq(pageLinks.wikiId, wiki.id), eq(pageLinks.sourcePath, pagePath)))
      .run();
    const sqlite = (db as any).session.client as import('better-sqlite3').Database;
    sqlite.prepare('DELETE FROM page_fts WHERE wiki_id = ? AND page_path = ?').run(wiki.id, pagePath);
  }
}

/** Get orphan pages — pages with no incoming links from other pages. */
export async function getOrphanPages(wikiSlug: string): Promise<PageInfo[]> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return [];

  const allPages = await listPages(wikiSlug);
  const db = getDb();

  // Get all link targets in this wiki (lowercase for matching)
  const allLinks = db.select()
    .from(pageLinks)
    .where(eq(pageLinks.wikiId, wiki.id))
    .all();

  const linkedTitles = new Set(allLinks.map((l) => l.targetTitleLower));

  // A page is orphan if no other page links to it
  // Exclude special pages (_home, _sidebar, etc.)
  return allPages.filter((page) => {
    if (page.path.startsWith('_')) return false;
    const title = filenameToTitle(page.path.split('/').pop()!);
    return !linkedTitles.has(title.toLowerCase());
  });
}

/** Update the stored wikilinks for a page (replace all links from this source). */
async function updatePageLinks(wikiSlug: string, pagePath: string, content: string): Promise<void> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return;

  const db = getDb();
  const targets = extractLinkTargets(content);

  // Delete existing links from this page
  db.delete(pageLinks)
    .where(and(eq(pageLinks.wikiId, wiki.id), eq(pageLinks.sourcePath, pagePath)))
    .run();

  // Insert new links
  for (const target of targets) {
    db.insert(pageLinks).values({
      id: nanoid(),
      wikiId: wiki.id,
      sourcePath: pagePath,
      targetTitle: target,
      targetTitleLower: target.toLowerCase(),
    }).run();
  }
}

/** Get pages that link to a given page (backlinks). */
export async function getBacklinks(
  wikiSlug: string,
  pagePath: string,
): Promise<PageInfo[]> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return [];

  const db = getDb();
  const title = filenameToTitle(pagePath.split('/').pop()!);

  // Find links whose target matches this page's title (case-insensitive)
  const links = db.select()
    .from(pageLinks)
    .where(and(
      eq(pageLinks.wikiId, wiki.id),
      eq(pageLinks.targetTitleLower, title.toLowerCase()),
    ))
    .all();

  // Get unique source paths and convert to PageInfo
  const sourcePaths = [...new Set(links.map((l) => l.sourcePath))];
  return sourcePaths.map((p) => ({
    path: p,
    title: filenameToTitle(p.split('/').pop()!),
    urlPath: filePathToUrlPath(p),
  }));
}

/** Update the FTS5 search index for a page. */
async function updateSearchIndex(wikiSlug: string, pagePath: string, content: string): Promise<void> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return;

  const db = getDb();
  const sqlite = (db as any).session.client as import('better-sqlite3').Database;
  const title = filenameToTitle(pagePath.split('/').pop()!);

  // Delete existing entry, then insert fresh
  sqlite.prepare('DELETE FROM page_fts WHERE wiki_id = ? AND page_path = ?').run(wiki.id, pagePath);
  sqlite.prepare('INSERT INTO page_fts (wiki_id, page_path, title, content) VALUES (?, ?, ?, ?)').run(
    wiki.id, pagePath, title, content,
  );
}

export interface SearchResult {
  path: string;
  title: string;
  urlPath: string;
  snippet: string;
}

/** Full-text search across pages in a wiki. */
export async function searchPages(
  wikiSlug: string,
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki) return [];

  const db = getDb();
  const sqlite = (db as any).session.client as import('better-sqlite3').Database;

  const rows = sqlite.prepare(`
    SELECT page_path, title, snippet(page_fts, 3, '<mark>', '</mark>', '...', 40) as snippet
    FROM page_fts
    WHERE wiki_id = ? AND page_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(wiki.id, query, limit) as Array<{ page_path: string; title: string; snippet: string }>;

  return rows.map((r) => ({
    path: r.page_path,
    title: r.title,
    urlPath: filePathToUrlPath(r.page_path),
    snippet: r.snippet,
  }));
}

/** Get recently changed pages across the wiki. */
export async function getRecentChanges(
  wikiSlug: string,
  limit = 20,
): Promise<Array<{ path: string; title: string; urlPath: string; authorName: string; date: string; message: string }>> {
  const git = getWikiGit(wikiSlug);
  // Get recent commits that touch .md files
  const log = await git.log(undefined, limit * 2); // Overfetch since some commits may be non-page

  const seen = new Set<string>();
  const results: Array<{ path: string; title: string; urlPath: string; authorName: string; date: string; message: string }> = [];

  for (const entry of log) {
    if (results.length >= limit) break;
    try {
      const files = await git.diffNameStatus(entry.hash);
      for (const file of files) {
        if (!file.path.endsWith('.md') || file.path.startsWith('.')) continue;
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        results.push({
          path: file.path,
          title: filenameToTitle(file.path.split('/').pop()!),
          urlPath: filePathToUrlPath(file.path),
          authorName: entry.authorName,
          date: entry.date,
          message: entry.message,
        });
        if (results.length >= limit) break;
      }
    } catch {
      // First commit — diffNameStatus may fail, skip
    }
  }

  return results;
}

/**
 * Pull latest changes from the remote and re-index all pages.
 * Called by the webhook handler when Forgejo notifies us of a push.
 */
export async function syncWikiFromRemote(wikiSlug: string): Promise<void> {
  const git = getWikiGit(wikiSlug);

  // Only pull if we have a remote configured
  try {
    await git.pull();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // If there's no remote or it fails, log and continue with re-index
    if (!message.includes('CONFLICT')) {
      console.error(`Webhook sync pull failed for ${wikiSlug}: ${message}`);
    }
  }

  // Re-index all page links and search
  await indexAllPageLinks(wikiSlug);
}

/** Get the history of a page. */
export async function getPageHistory(
  wikiSlug: string,
  pagePath: string,
  limit = 50,
): Promise<PageHistoryEntry[]> {
  const git = getWikiGit(wikiSlug);
  return git.log(pagePath, limit);
}

/** Resolve a page path from a URL path segment. Case-insensitive. */
export async function resolvePagePath(wikiSlug: string, urlPath: string): Promise<string | null> {
  const pages = await listPages(wikiSlug);
  // URL path has underscores, compare against scrubbed page paths
  const normalizedUrl = urlPath.toLowerCase();
  const match = pages.find((p) => p.urlPath.toLowerCase() === normalizedUrl);
  return match?.path ?? null;
}
