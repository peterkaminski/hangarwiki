import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nanoid } from 'nanoid';
import { requestMagicLink, verifyMagicLink, validateSession, invalidateSession, exportPrivateKey } from './auth.js';
import { getDb, initDb, resetDb } from '../db/index.js';
import { magicLinks } from '../db/schema.js';
import { hashToken, generateToken } from './crypto.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'hangarwiki-auth-test-'));
  process.env.DATA_DIR = tmpDir;
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
  process.env.EMAIL_PROVIDER = 'console';
  resetDb();
  initDb();
});

afterEach(async () => {
  resetDb();
  await rm(tmpDir, { recursive: true, force: true });
});

/** Helper: insert a magic link and return the raw token for verification. */
function insertMagicLink(email: string, expiresAt?: Date) {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const db = getDb();
  db.insert(magicLinks).values({
    id: nanoid(),
    email,
    tokenHash,
    expiresAt: (expiresAt ?? new Date(Date.now() + 15 * 60 * 1000)).toISOString(),
  }).run();
  return rawToken;
}

describe('magic link flow', () => {
  it('creates a magic link and verifies it', async () => {
    // Request sends email (logged to console) and stores a link
    await requestMagicLink('alice@example.com');

    const db = getDb();
    const links = db.select().from(magicLinks).all();
    expect(links).toHaveLength(1);
    expect(links[0].email).toBe('alice@example.com');

    // Verify using a separately inserted link (since we can't recover the raw token)
    const token = insertMagicLink('bob@example.com');
    const result = await verifyMagicLink(token);
    expect(result.sessionToken).toBeTruthy();
    expect(result.user.email).toBe('bob@example.com');
    expect(result.user.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('allows re-verify within grace period (browser double-fetch)', async () => {
    const token = insertMagicLink('carol@example.com');

    const first = await verifyMagicLink(token);
    const second = await verifyMagicLink(token);
    expect(first.user.email).toBe('carol@example.com');
    expect(second.user.email).toBe('carol@example.com');
    // Different session tokens (each verify creates a new session)
    expect(first.sessionToken).not.toBe(second.sessionToken);
  });

  it('rejects an expired magic link', async () => {
    const token = insertMagicLink('dave@example.com', new Date(Date.now() - 1000));

    await expect(verifyMagicLink(token)).rejects.toThrow('expired');
  });
});

describe('session management', () => {
  it('validates a session created during magic link verification', async () => {
    const token = insertMagicLink('eve@example.com');
    const { sessionToken, user } = await verifyMagicLink(token);

    const validatedUser = await validateSession(sessionToken);
    expect(validatedUser).not.toBeNull();
    expect(validatedUser!.email).toBe('eve@example.com');
    expect(validatedUser!.id).toBe(user.id);
  });

  it('invalidates a session on logout', async () => {
    const token = insertMagicLink('frank@example.com');
    const { sessionToken } = await verifyMagicLink(token);

    expect(await validateSession(sessionToken)).not.toBeNull();

    await invalidateSession(sessionToken);

    expect(await validateSession(sessionToken)).toBeNull();
  });
});

describe('key export', () => {
  it('exports the private key for a user', async () => {
    const token = insertMagicLink('grace@example.com');
    const { user } = await verifyMagicLink(token);

    const privateKey = await exportPrivateKey(user.id);
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
  });
});
