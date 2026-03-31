import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { join } from 'node:path';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { users, wikis, wikiMembers, pageIndex } from '../db/schema.js';
import { GitService, type GitAuthor } from './git.js';
import { ForgeClient } from './forge.js';
import { filenameToTitle, filePathToUrlPath } from './paths.js';

export interface WikiInfo {
  id: string;
  slug: string;
  title: string;
  visibility: 'public' | 'private';
  incipientLinkStyle: 'create' | 'highlight';
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

/** Get a GitService for a wiki. */
export function getWikiGit(slug: string): GitService {
  return new GitService(wikiRepoPath(slug));
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

  return { id, slug, title, visibility, incipientLinkStyle: 'create' as const };
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

  const values: Partial<{ title: string; visibility: string; incipientLinkStyle: string }> = {};
  if (updates.title !== undefined) values.title = updates.title;
  if (updates.visibility !== undefined) values.visibility = updates.visibility;
  if (updates.incipientLinkStyle !== undefined) values.incipientLinkStyle = updates.incipientLinkStyle;

  if (Object.keys(values).length > 0) {
    db.update(wikis).set(values).where(eq(wikis.slug, slug)).run();
  }

  return getWiki(slug);
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

  return {
    path: pagePath,
    title: filenameToTitle(pagePath.split('/').pop()!),
    content,
    urlPath: filePathToUrlPath(pagePath),
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
