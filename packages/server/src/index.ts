import Fastify from 'fastify';
import { config } from './config.js';

const app = Fastify({ logger: true });

// Health check
app.get('/api/health', async () => {
  return { status: 'ok', version: '0.1.0' };
});

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`HangarWiki server listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
