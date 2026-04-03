import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, mkdir, constants } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../config.js';

const exec = promisify(execFile);

/** Directory where the server's SSH keypair is stored (always absolute). */
function sshDir(): string {
  return resolve(config.dataDir, 'ssh');
}

/** Path to the server's private key. */
export function serverKeyPath(): string {
  return join(sshDir(), 'id_ed25519');
}

/** Path to the server's public key. */
function serverPubKeyPath(): string {
  return join(sshDir(), 'id_ed25519.pub');
}

/**
 * Ensure the server has an SSH keypair. Generates one if it doesn't exist.
 * Call once on startup.
 */
export async function ensureServerKey(): Promise<void> {
  const keyPath = serverKeyPath();

  try {
    await access(keyPath, constants.F_OK);
    return; // Key already exists
  } catch {
    // Key doesn't exist — generate it
  }

  await mkdir(sshDir(), { recursive: true });
  await exec('ssh-keygen', [
    '-t', 'ed25519',
    '-f', keyPath,
    '-N', '',  // No passphrase
    '-C', 'hangarwiki-server',
  ]);

  console.log(`Generated server SSH key at ${keyPath}`);
}

/** Read the server's public key. */
export async function getServerPublicKey(): Promise<string> {
  return (await readFile(serverPubKeyPath(), 'utf-8')).trim();
}

/**
 * Build the GIT_SSH_COMMAND value that forces git to use the server's deploy key
 * and the correct SSH port.
 */
export function gitSshCommand(): string {
  const key = serverKeyPath();
  const port = config.forgeSshPort;
  return `ssh -i ${key} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port}`;
}
