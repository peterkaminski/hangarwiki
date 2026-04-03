import { join } from 'node:path';

/** Configuration — reads from process.env on each access so tests can override. */
export const config = {
  get port() { return parseInt(process.env.PORT ?? '4000', 10); },
  get host() { return process.env.HOST ?? '0.0.0.0'; },

  // Data directory for local git clones and SQLite DB
  get dataDir() { return process.env.DATA_DIR ?? join(process.cwd(), 'data'); },

  // Forgejo / Gitea
  get forgeUrl() { return process.env.FORGE_URL ?? 'http://localhost:3000'; },
  get forgeApiToken() { return process.env.FORGE_API_TOKEN ?? ''; },

  // Magic link auth
  magicLinkExpiryMinutes: 15,
  sessionExpiryDays: 30,
  get appUrl() { return process.env.APP_URL ?? 'http://localhost:5173'; },

  // Email (Postmark first, Resend as alternative)
  get emailProvider() { return (process.env.EMAIL_PROVIDER ?? 'console') as 'postmark' | 'resend' | 'console'; },
  get postmarkApiToken() { return process.env.POSTMARK_API_TOKEN ?? ''; },
  get resendApiKey() { return process.env.RESEND_API_KEY ?? ''; },
  get emailFrom() { return process.env.EMAIL_FROM ?? 'wiki@example.com'; },

  // Server-side encryption key for stored private keys
  get encryptionKey() { return process.env.ENCRYPTION_KEY ?? ''; },

  // Webhook secret for verifying Forgejo/Gitea push notifications
  get webhookSecret() { return process.env.WEBHOOK_SECRET ?? ''; },

  // Forgejo SSH port (for deploy key git access; may differ from default 22 in Docker dev)
  get forgeSshPort() { return parseInt(process.env.FORGE_SSH_PORT ?? '22', 10); },

  // Server URL reachable by Forgejo (for webhook callbacks)
  // In dev with Docker: http://host.docker.internal:4000
  // In production: https://wiki.example.com (behind Caddy)
  get serverUrl() { return process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? '4000'}`; },
};
