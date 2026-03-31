import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { config } from '../config.js';

export interface KeyPair {
  publicKey: string;  // base64-encoded
  privateKey: string; // base64-encoded (raw, before encryption)
}

/** Generate an Ed25519 keypair. */
export function generateKeypair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKey: publicKey,
    privateKey: privateKey,
  };
}

/** Convert an Ed25519 PEM public key to OpenSSH format for Forgejo/git. */
export function pemToOpenSSH(pemPublicKey: string): string {
  // Extract the base64-encoded key data from the PEM
  const lines = pemPublicKey.trim().split('\n');
  const b64 = lines.slice(1, -1).join('');
  const der = Buffer.from(b64, 'base64');

  // Ed25519 SPKI DER has a fixed 12-byte header before the 32-byte key
  const keyData = der.subarray(12);

  // Build the SSH wire format: string "ssh-ed25519" + string <key-data>
  const typeStr = 'ssh-ed25519';
  const typeBuf = Buffer.alloc(4 + typeStr.length);
  typeBuf.writeUInt32BE(typeStr.length, 0);
  typeBuf.write(typeStr, 4);

  const keyBuf = Buffer.alloc(4 + keyData.length);
  keyBuf.writeUInt32BE(keyData.length, 0);
  keyData.copy(keyBuf, 4);

  const sshKey = Buffer.concat([typeBuf, keyBuf]).toString('base64');
  return `ssh-ed25519 ${sshKey}`;
}

/** Encrypt a private key for storage. Uses AES-256-GCM with the server's encryption key. */
export function encryptPrivateKey(privateKeyPem: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(privateKeyPem, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Pack as: iv (base64) . authTag (base64) . ciphertext (base64)
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted}`;
}

/** Decrypt a stored private key. */
export function decryptPrivateKey(encryptedData: string): string {
  const [ivB64, authTagB64, ciphertext] = encryptedData.split('.');
  const key = deriveEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Hash a token for storage (we never store raw tokens). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically secure random token. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function deriveEncryptionKey(): Buffer {
  if (!config.encryptionKey) {
    throw new Error('ENCRYPTION_KEY is required for private key encryption');
  }
  // Derive a 32-byte key from the configured secret
  return createHash('sha256').update(config.encryptionKey).digest();
}
