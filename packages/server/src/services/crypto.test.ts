import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  pemToOpenSSH,
  hashToken,
  generateToken,
} from './crypto.js';

// Set encryption key for tests
beforeEach(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
});

describe('generateKeypair', () => {
  it('generates a valid Ed25519 keypair in PEM format', () => {
    const kp = generateKeypair();
    expect(kp.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(kp.privateKey).toContain('BEGIN PRIVATE KEY');
  });
});

describe('pemToOpenSSH', () => {
  it('converts PEM public key to OpenSSH format', () => {
    const kp = generateKeypair();
    const ssh = pemToOpenSSH(kp.publicKey);
    expect(ssh).toMatch(/^ssh-ed25519 [A-Za-z0-9+/=]+$/);
  });
});

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('round-trips a private key through encrypt/decrypt', () => {
    const kp = generateKeypair();
    const encrypted = encryptPrivateKey(kp.privateKey);

    // Encrypted form should be three base64 segments separated by dots
    expect(encrypted.split('.')).toHaveLength(3);

    const decrypted = decryptPrivateKey(encrypted);
    expect(decrypted).toBe(kp.privateKey);
  });

  it('produces different ciphertext for the same key (random IV)', () => {
    const kp = generateKeypair();
    const e1 = encryptPrivateKey(kp.privateKey);
    const e2 = encryptPrivateKey(kp.privateKey);
    expect(e1).not.toBe(e2);
  });
});

describe('hashToken', () => {
  it('produces a consistent hex hash', () => {
    const hash1 = hashToken('my-token');
    const hash2 = hashToken('my-token');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});

describe('generateToken', () => {
  it('produces a base64url string', () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces unique tokens', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});
