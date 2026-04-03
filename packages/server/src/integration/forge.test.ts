/**
 * Integration tests against a local Forgejo instance.
 *
 * These tests require a running Forgejo at http://localhost:3000 with a valid API token.
 * Skip if FORGE_API_TOKEN is not set.
 *
 * Run: FORGE_URL=http://localhost:3000 FORGE_API_TOKEN=<token> npm test -- src/integration/forge.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ForgeClient } from '../services/forge.js';
import { GitService } from '../services/git.js';

const FORGE_URL = process.env.FORGE_URL ?? 'http://localhost:3000';
const FORGE_TOKEN = process.env.FORGE_API_TOKEN ?? '';

const shouldRun = !!FORGE_TOKEN;

describe.skipIf(!shouldRun)('Forgejo integration', () => {
  let forge: ForgeClient;
  let currentUser: string;
  const createdRepos: string[] = [];

  beforeAll(async () => {
    forge = new ForgeClient(FORGE_URL, FORGE_TOKEN);
    const info = await forge.detectServer();
    console.log(`Testing against ${info.flavor} ${info.version}`);
    const user = await forge.getCurrentUser();
    currentUser = user.login;
  });

  afterAll(async () => {
    // Clean up any repos we created
    for (const repo of createdRepos) {
      try {
        await forge.deleteRepo(currentUser, repo);
      } catch {
        // Already deleted or doesn't exist
      }
    }
  });

  it('should detect server flavor and version', async () => {
    const info = await forge.detectServer();
    // Forgejo 9+ reports version as "9.x+gitea-1.22.x", so flavor may be 'gitea'
    expect(['forgejo', 'gitea']).toContain(info.flavor);
    expect(info.version).toBeTruthy();
  });

  it('should create and delete a repo', async () => {
    const repoName = `hw-test-${Date.now()}`;
    createdRepos.push(repoName);

    const repo = await forge.createRepo(repoName, {
      description: 'Integration test repo',
      private: false,
    });

    expect(repo.name).toBe(repoName);
    expect(repo.clone_url).toContain(repoName);

    // Verify we can fetch it
    const fetched = await forge.getRepo(currentUser, repoName);
    expect(fetched.name).toBe(repoName);

    // Clean up
    await forge.deleteRepo(currentUser, repoName);
    createdRepos.pop();
  });

  it('should create a webhook on a repo', async () => {
    const repoName = `hw-test-webhook-${Date.now()}`;
    createdRepos.push(repoName);

    await forge.createRepo(repoName, { description: 'Webhook test' });

    const secret = 'test-secret-' + Date.now();
    const webhook = await forge.createWebhook(
      currentUser,
      repoName,
      'http://host.docker.internal:4000/api/webhooks/push',
      secret,
    );

    expect(webhook.id).toBeTruthy();
    expect(webhook.active).toBe(true);

    // Verify webhook appears in list
    const hooks = await forge.listWebhooks(currentUser, repoName);
    expect(hooks.some((h) => h.id === webhook.id)).toBe(true);

    // Clean up webhook
    await forge.deleteWebhook(currentUser, repoName, webhook.id);

    // Clean up repo
    await forge.deleteRepo(currentUser, repoName);
    createdRepos.pop();
  });

  it('should clone a Forgejo repo, push changes, and pull them back', async () => {
    const repoName = `hw-test-pushpull-${Date.now()}`;
    createdRepos.push(repoName);

    const repo = await forge.createRepo(repoName, { description: 'Push/pull test' });

    // Embed API token in clone URL for HTTP auth
    const authedUrl = repo.clone_url.replace('://', `://${currentUser}:${FORGE_TOKEN}@`);

    // Clone into a temp dir
    const dir1 = await mkdtemp(join(tmpdir(), 'hw-forge-test1-'));
    const git1 = new GitService(dir1);
    await git1.clone(authedUrl);
    await git1.setConfig('user.name', 'Test User');
    await git1.setConfig('user.email', 'test@example.com');

    // Make a change and push
    await git1.writeFile('test-page.md', '# Test Page\n\nCreated by integration test.\n');
    await git1.add('test-page.md');
    await git1.commit('Add test page', { name: 'Test User', email: 'test@example.com' });
    const pushed = await git1.push();
    expect(pushed).toBe(true);

    // Clone into a second dir and verify the file is there
    const dir2 = await mkdtemp(join(tmpdir(), 'hw-forge-test2-'));
    const git2 = new GitService(dir2);
    await git2.clone(authedUrl);

    const content = await git2.readFile('test-page.md');
    expect(content).toContain('Created by integration test');

    // Clean up
    await rm(dir1, { recursive: true, force: true });
    await rm(dir2, { recursive: true, force: true });
    await forge.deleteRepo(currentUser, repoName);
    createdRepos.pop();
  });

  it('should register and list deploy keys', async () => {
    const repoName = `hw-test-keys-${Date.now()}`;
    createdRepos.push(repoName);

    await forge.createRepo(repoName, { description: 'Key test' });

    // Generate a throwaway SSH key for testing
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const keyDir = await mkdtemp(join(tmpdir(), 'hw-key-test-'));
    const keyPath = join(keyDir, 'test_key');
    await exec('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'test@hangarwiki']);

    const { readFile } = await import('node:fs/promises');
    const pubKey = (await readFile(keyPath + '.pub', 'utf-8')).trim();

    const key = await forge.addDeployKey(currentUser, repoName, 'test-deploy-key', pubKey, false);
    expect(key.id).toBeTruthy();
    expect(key.title).toBe('test-deploy-key');

    const keys = await forge.listDeployKeys(currentUser, repoName);
    expect(keys.some((k) => k.id === key.id)).toBe(true);

    // Clean up
    await forge.deleteDeployKey(currentUser, repoName, key.id);
    await rm(keyDir, { recursive: true, force: true });
    await forge.deleteRepo(currentUser, repoName);
    createdRepos.pop();
  });
});
