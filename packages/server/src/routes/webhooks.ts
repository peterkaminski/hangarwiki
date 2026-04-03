import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { wikis } from '../db/schema.js';
import { syncWikiFromRemote } from '../services/wiki.js';

// Extend FastifyRequest to hold the raw body string
declare module 'fastify' {
  interface FastifyRequest {
    rawBodyString?: string;
  }
}

/** Verify the HMAC-SHA256 signature from Forgejo/Gitea. */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface PushPayload {
  ref: string;
  repository: {
    full_name: string; // "owner/repo"
    name: string;
    owner: { login: string };
  };
}

export async function webhookRoutes(app: FastifyInstance) {
  // Custom JSON parser that preserves the raw body for HMAC verification.
  // This only applies within this plugin scope (Fastify encapsulation).
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: FastifyRequest, body: string, done: (err: Error | null, result?: unknown) => void) => {
      req.rawBodyString = body;
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  /**
   * POST /api/webhooks/push
   * Receives push event notifications from Forgejo/Gitea.
   */
  app.post<{ Body: PushPayload }>(
    '/api/webhooks/push',
    async (req, reply) => {
      const rawBody = req.rawBodyString ?? '';

      // Forgejo sends X-Forgejo-Signature, Gitea sends X-Gitea-Signature
      const signature =
        (req.headers['x-forgejo-signature'] as string) ??
        (req.headers['x-gitea-signature'] as string) ??
        '';

      if (!verifySignature(rawBody, signature, config.webhookSecret)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const payload = req.body;
      if (!payload?.repository?.full_name) {
        return reply.status(400).send({ error: 'Missing repository info' });
      }

      const owner = payload.repository.owner.login;
      const name = payload.repository.name;

      // Find the wiki that corresponds to this forge repo
      const db = getDb();
      const wiki = db.select()
        .from(wikis)
        .where(and(eq(wikis.forgeOwner, owner), eq(wikis.forgeRepo, name)))
        .get();

      if (!wiki) {
        req.log.warn(`Webhook received for unknown repo: ${owner}/${name}`);
        return reply.status(404).send({ error: 'No wiki found for this repository' });
      }

      // Sync in the background — don't block the webhook response
      req.log.info(`Webhook: syncing wiki "${wiki.slug}" from ${owner}/${name}`);
      syncWikiFromRemote(wiki.slug).catch((err) => {
        req.log.error(err, `Webhook sync failed for wiki "${wiki.slug}"`);
      });

      return { ok: true, wiki: wiki.slug };
    },
  );
}
