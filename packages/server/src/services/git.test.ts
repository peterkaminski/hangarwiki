import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitService } from './git.js';

describe('GitService', () => {
  let dir: string;
  let git: GitService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hangarwiki-test-'));
    git = new GitService(dir);
    await git.init();
    // Configure git identity for tests
    await git.setConfig('user.name', 'Test User');
    await git.setConfig('user.email', 'test@example.com');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('should initialize a git repo', async () => {
    expect(await git.isRepo()).toBe(true);
  });

  it('should write, add, and commit a file', async () => {
    await git.writeFile('test.md', '# Hello\n');
    await git.add('test.md');
    const hash = await git.commit('add test page', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThanOrEqual(7);
  });

  it('should list files', async () => {
    await git.writeFile('page-one.md', '# One\n');
    await git.writeFile('folder/page-two.md', '# Two\n');
    await git.add('.');
    await git.commit('add pages', { name: 'Test', email: 'test@example.com' });

    const files = await git.listFiles();
    expect(files).toContain('page-one.md');
    expect(files).toContain('folder/page-two.md');
  });

  it('should read file contents at HEAD', async () => {
    const content = '# Hello World\n\nSome content.';
    await git.writeFile('test.md', content);
    await git.add('test.md');
    await git.commit('add test', { name: 'Test', email: 'test@example.com' });

    const read = await git.readFile('test.md');
    expect(read).toBe(content);
  });

  it('should return log entries for a file', async () => {
    await git.writeFile('test.md', 'v1');
    await git.add('test.md');
    await git.commit('first', { name: 'Alice', email: 'alice@example.com' });

    await git.writeFile('test.md', 'v2');
    await git.add('test.md');
    await git.commit('second', { name: 'Bob', email: 'bob@example.com' });

    const entries = await git.log('test.md');
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe('second');
    expect(entries[0].authorName).toBe('Bob');
    expect(entries[1].message).toBe('first');
    expect(entries[1].authorName).toBe('Alice');
  });

  it('should detect uncommitted changes', async () => {
    await git.writeFile('test.md', 'content');
    await git.add('test.md');
    await git.commit('initial', { name: 'Test', email: 'test@example.com' });

    expect(await git.hasChanges()).toBe(false);

    await git.writeFile('test.md', 'changed');
    expect(await git.hasChanges()).toBe(true);
  });

  it('should delete a file', async () => {
    await git.writeFile('test.md', 'content');
    await git.add('test.md');
    await git.commit('add', { name: 'Test', email: 'test@example.com' });

    await git.deleteFile('test.md');
    await git.commit('delete', { name: 'Test', email: 'test@example.com' });

    const files = await git.listFiles();
    expect(files).not.toContain('test.md');
  });

  it('should report the current branch', async () => {
    // Need at least one commit for branch to exist
    await git.writeFile('init.md', 'init');
    await git.add('init.md');
    await git.commit('init', { name: 'Test', email: 'test@example.com' });

    const branch = await git.currentBranch();
    // Could be 'main' or 'master' depending on git config
    expect(['main', 'master']).toContain(branch);
  });
});
