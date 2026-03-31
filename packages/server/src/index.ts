import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { optionalAuth } from './middleware/auth.js';

async function main() {
  // Initialize database first
  initDb();

  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cookie);
  await app.register(cors, {
    origin: config.appUrl,
    credentials: true,
  });

  // Populate req.user on all requests if session cookie present
  app.addHook('preHandler', optionalAuth);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // Routes
  await app.register(authRoutes);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`HangarWiki server listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
