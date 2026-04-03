import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { wikiRoutes } from './routes/wikis.js';
import { pageRoutes } from './routes/pages.js';
import { attachmentRoutes } from './routes/attachments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { optionalAuth } from './middleware/auth.js';
import { ensureServerKey } from './services/ssh.js';

async function main() {
  // Initialize database and server SSH key
  initDb();
  await ensureServerKey();

  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cookie);
  await app.register(cors, {
    origin: config.appUrl,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Populate req.user on all requests if session cookie present
  app.addHook('preHandler', optionalAuth);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // Routes
  await app.register(authRoutes);
  await app.register(wikiRoutes);
  await app.register(pageRoutes);
  await app.register(attachmentRoutes);
  await app.register(webhookRoutes);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`HangarWiki server listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
