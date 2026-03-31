import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { users, sessions, magicLinks } from '../db/schema.js';
import { config } from '../config.js';
import { getEmailProvider } from './email.js';
import {
  generateKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  pemToOpenSSH,
  hashToken,
  generateToken,
} from './crypto.js';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  publicKey: string | null;
}

/** Request a magic link. Creates user if needed, sends email. */
export async function requestMagicLink(email: string): Promise<void> {
  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // Generate token
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.magicLinkExpiryMinutes * 60 * 1000).toISOString();

  // Store magic link
  db.insert(magicLinks).values({
    id: nanoid(),
    email: normalizedEmail,
    tokenHash,
    expiresAt,
  }).run();

  // Send email
  const verifyUrl = `${config.appUrl}/auth/verify?token=${token}`;
  const emailProvider = getEmailProvider();
  await emailProvider.send({
    to: normalizedEmail,
    subject: 'Sign in to HangarWiki',
    textBody: `Click this link to sign in to HangarWiki:\n\n${verifyUrl}\n\nThis link expires in ${config.magicLinkExpiryMinutes} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
    htmlBody: `
      <p>Click this link to sign in to HangarWiki:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in ${config.magicLinkExpiryMinutes} minutes.</p>
      <p style="color: #666;">If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

/** Verify a magic link token. Returns a session token on success. */
export async function verifyMagicLink(token: string): Promise<{ sessionToken: string; user: AuthUser }> {
  const db = getDb();
  const tokenHash = hashToken(token);

  // Find the magic link
  const link = db.select().from(magicLinks)
    .where(eq(magicLinks.tokenHash, tokenHash))
    .get();

  if (!link) {
    throw new Error('Invalid or expired link');
  }

  if (link.usedAt) {
    throw new Error('This link has already been used');
  }

  if (new Date(link.expiresAt) < new Date()) {
    throw new Error('This link has expired');
  }

  // Mark as used
  db.update(magicLinks)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(magicLinks.id, link.id))
    .run();

  // Find or create user
  let user = db.select().from(users)
    .where(eq(users.email, link.email))
    .get();

  if (!user) {
    // New user — generate keypair
    const keypair = generateKeypair();
    const encryptedKey = config.encryptionKey
      ? encryptPrivateKey(keypair.privateKey)
      : null;

    const id = nanoid();
    db.insert(users).values({
      id,
      email: link.email,
      displayName: link.email.split('@')[0],
      publicKey: keypair.publicKey,
      encryptedPrivateKey: encryptedKey,
    }).run();

    user = db.select().from(users).where(eq(users.id, id)).get()!;
  }

  // Create session
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(
    Date.now() + config.sessionExpiryDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.insert(sessions).values({
    id: nanoid(),
    userId: user.id,
    tokenHash: sessionTokenHash,
    expiresAt: sessionExpiresAt,
  }).run();

  return {
    sessionToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      publicKey: user.publicKey,
    },
  };
}

/** Validate a session token. Returns the user if valid. */
export async function validateSession(sessionToken: string): Promise<AuthUser | null> {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);

  const session = db.select().from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .get();

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  const user = db.select().from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    publicKey: user.publicKey,
  };
}

/** Invalidate a session (logout). */
export async function invalidateSession(sessionToken: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
}

/** Get a user's SSH public key in OpenSSH format (for Forgejo registration). */
export function getUserOpenSSHKey(publicKeyPem: string): string {
  return pemToOpenSSH(publicKeyPem);
}

/** Export a user's private key (decrypted). */
export async function exportPrivateKey(userId: string): Promise<string> {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  if (!user?.encryptedPrivateKey) {
    throw new Error('No private key stored for this user');
  }

  return decryptPrivateKey(user.encryptedPrivateKey);
}
