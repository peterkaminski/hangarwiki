import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nanoid } from 'nanoid';
import { initDb, resetDb, getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import {
  createWiki,
  listWikis,
  getWiki,
  checkAccess,
  listPages,
  getPage,
  savePage,
  deletePage,
  getPageHistory,
  resolvePagePath,
} from './wiki.js';

let tmpDir: string;
let testUserId: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'hangarwiki-wiki-test-'));
  process.env.DATA_DIR = tmpDir;
  process.env.ENCRYPTION_KEY = 'test-key';
  resetDb();
  initDb();

  // Create a test user
  testUserId = nanoid();
  const db = getDb();
  db.insert(users).values({
    id: testUserId,
    email: 'test@example.com',
    displayName: 'Test User',
  }).run();
});

afterEach(async () => {
  resetDb();
  await rm(tmpDir, { recursive: true, force: true });
});

const testAuthor = { name: 'Test User', email: 'test@example.com' };

describe('createWiki', () => {
  it('creates a wiki with initial files', async () => {
    const wiki = await createWiki('test-wiki', 'Test Wiki', testUserId);
    expect(wiki.slug).toBe('test-wiki');
    expect(wiki.title).toBe('Test Wiki');

    const pages = await listPages('test-wiki');
    const pagePaths = pages.map((p) => p.path);
    expect(pagePaths).toContain('_home.md');
  });

  it('creates the owner membership', async () => {
    await createWiki('my-wiki', 'My Wiki', testUserId);
    const hasAccess = await checkAccess('my-wiki', testUserId, 'owner');
    expect(hasAccess).toBe(true);
  });
});

describe('listWikis', () => {
  it('lists wikis the user is a member of', async () => {
    await createWiki('wiki-a', 'Wiki A', testUserId);
    await createWiki('wiki-b', 'Wiki B', testUserId);

    const wikis = await listWikis(testUserId);
    expect(wikis).toHaveLength(2);
    expect(wikis.map((w) => w.slug).sort()).toEqual(['wiki-a', 'wiki-b']);
  });
});

describe('checkAccess', () => {
  it('allows public wiki viewing without auth', async () => {
    await createWiki('public-wiki', 'Public', testUserId, 'public');
    expect(await checkAccess('public-wiki', undefined, 'viewer')).toBe(true);
  });

  it('denies private wiki viewing without auth', async () => {
    await createWiki('private-wiki', 'Private', testUserId, 'private');
    expect(await checkAccess('private-wiki', undefined, 'viewer')).toBe(false);
  });

  it('denies editing for non-members', async () => {
    await createWiki('wiki-c', 'Wiki C', testUserId);
    expect(await checkAccess('wiki-c', 'some-other-user', 'editor')).toBe(false);
  });
});

describe('page CRUD', () => {
  beforeEach(async () => {
    await createWiki('wiki-pages', 'Page Test Wiki', testUserId);
  });

  it('creates and reads a page', async () => {
    const saved = await savePage('wiki-pages', 'My Page.md', '# Hello\n\nWorld.', testAuthor);
    expect(saved.title).toBe('My Page');
    expect(saved.urlPath).toBe('My_Page');

    const read = await getPage('wiki-pages', 'My Page.md');
    expect(read).not.toBeNull();
    expect(read!.content).toBe('# Hello\n\nWorld.');
  });

  it('creates pages in folders', async () => {
    await savePage('wiki-pages', 'Projects/Alpha.md', '# Alpha', testAuthor);
    const pages = await listPages('wiki-pages');
    const paths = pages.map((p) => p.path);
    expect(paths).toContain('Projects/Alpha.md');

    const page = await getPage('wiki-pages', 'Projects/Alpha.md');
    expect(page!.urlPath).toBe('Projects/Alpha');
  });

  it('updates an existing page', async () => {
    await savePage('wiki-pages', 'Update Me.md', 'v1', testAuthor);
    await savePage('wiki-pages', 'Update Me.md', 'v2', testAuthor);

    const page = await getPage('wiki-pages', 'Update Me.md');
    expect(page!.content).toBe('v2');
  });

  it('deletes a page', async () => {
    await savePage('wiki-pages', 'Delete Me.md', 'gone soon', testAuthor);
    await deletePage('wiki-pages', 'Delete Me.md', testAuthor);

    const page = await getPage('wiki-pages', 'Delete Me.md');
    expect(page).toBeNull();
  });

  it('returns page history', async () => {
    await savePage('wiki-pages', 'History.md', 'v1', testAuthor, 'first version');
    await savePage('wiki-pages', 'History.md', 'v2', testAuthor, 'second version');

    const history = await getPageHistory('wiki-pages', 'History.md');
    expect(history).toHaveLength(2);
    expect(history[0].message).toBe('second version');
    expect(history[1].message).toBe('first version');
  });

  it('resolves URL paths to file paths', async () => {
    await savePage('wiki-pages', 'My Cool Page.md', '# Cool', testAuthor);
    const resolved = await resolvePagePath('wiki-pages', 'My_Cool_Page');
    expect(resolved).toBe('My Cool Page.md');
  });

  it('resolves URL paths case-insensitively', async () => {
    await savePage('wiki-pages', 'CamelCase.md', '# CC', testAuthor);
    const resolved = await resolvePagePath('wiki-pages', 'camelcase');
    expect(resolved).toBe('CamelCase.md');
  });
});
