import { join } from 'node:path';

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  host: process.env.HOST ?? '0.0.0.0',

  // Data directory for local git clones and SQLite DB
  dataDir: process.env.DATA_DIR ?? join(process.cwd(), 'data'),

  // Forgejo / Gitea
  forgeUrl: process.env.FORGE_URL ?? 'http://localhost:3000',
  forgeApiToken: process.env.FORGE_API_TOKEN ?? '',

  // Magic link auth
  magicLinkExpiryMinutes: 15,
  sessionExpiryDays: 30,
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',

  // Email (Postmark first, Resend as alternative)
  emailProvider: (process.env.EMAIL_PROVIDER ?? 'console') as 'postmark' | 'resend' | 'console',
  postmarkApiToken: process.env.POSTMARK_API_TOKEN ?? '',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'wiki@example.com',

  // Server-side encryption key for stored private keys
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
};
