import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { webhookRoutes } from './webhooks.js';

const TEST_SECRET = 'test-webhook-secret-for-hmac';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhook endpoint', () => {
  const app = Fastify();

  beforeAll(async () => {
    // Set the webhook secret for tests
    process.env.WEBHOOK_SECRET = TEST_SECRET;

    // We need a minimal DB for the wiki lookup
    process.env.DATA_DIR = '/tmp/hangarwiki-webhook-test-' + Date.now();
    const { initDb } = await import('../db/index.js');
    initDb();

    await app.register(webhookRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { rm } = await import('node:fs/promises');
    await rm(process.env.DATA_DIR!, { recursive: true, force: true });
  });

  it('should reject requests with no signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/push',
      payload: { ref: 'refs/heads/main', repository: { full_name: 'user/repo', name: 'repo', owner: { login: 'user' } } },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Invalid signature');
  });

  it('should reject requests with wrong signature', async () => {
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'user/repo', name: 'repo', owner: { login: 'user' } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/push',
      headers: {
        'content-type': 'application/json',
        'x-forgejo-signature': 'wrong-signature-value-that-is-64-chars-long-for-hex-sha256-00000',
      },
      payload,
    });

    expect(res.statusCode).toBe(401);
  });

  it('should accept requests with valid Forgejo signature but return 404 for unknown repo', async () => {
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'user/repo', name: 'repo', owner: { login: 'user' } },
    });
    const signature = sign(payload, TEST_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/push',
      headers: {
        'content-type': 'application/json',
        'x-forgejo-signature': signature,
      },
      payload,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('No wiki found');
  });

  it('should accept requests with valid Gitea signature header', async () => {
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'user/repo', name: 'repo', owner: { login: 'user' } },
    });
    const signature = sign(payload, TEST_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/push',
      headers: {
        'content-type': 'application/json',
        'x-gitea-signature': signature,
      },
      payload,
    });

    // Should pass signature check (404 because repo doesn't exist, not 401)
    expect(res.statusCode).toBe(404);
  });

  it('should reject requests with missing repository info', async () => {
    const payload = JSON.stringify({ ref: 'refs/heads/main' });
    const signature = sign(payload, TEST_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/push',
      headers: {
        'content-type': 'application/json',
        'x-forgejo-signature': signature,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Missing repository info');
  });
});
