import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { createWiki, listWikis, getWiki } from '../services/wiki.js';

export async function wikiRoutes(app: FastifyInstance) {
  /** List wikis the current user has access to. */
  app.get(
    '/api/wikis',
    { preHandler: requireAuth },
    async (req) => {
      const wikis = await listWikis(req.user!.id);
      return { wikis };
    },
  );

  /** Get a wiki by slug. */
  app.get<{ Params: { wiki: string } }>(
    '/api/wikis/:wiki',
    async (req, reply) => {
      const wiki = await getWiki(req.params.wiki);
      if (!wiki) return reply.status(404).send({ error: 'Wiki not found' });

      // Check access for private wikis
      if (wiki.visibility === 'private' && !req.user) {
        return reply.status(404).send({ error: 'Wiki not found' });
      }

      return { wiki };
    },
  );

  /** Create a new wiki. */
  app.post<{ Body: { slug: string; title: string; visibility?: 'public' | 'private' } }>(
    '/api/wikis',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { slug, title, visibility } = req.body;

      if (!slug || !title) {
        return reply.status(400).send({ error: 'slug and title are required' });
      }

      // Validate slug format
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) {
        return reply.status(400).send({ error: 'Slug must be lowercase alphanumeric with hyphens' });
      }

      // Check if slug is taken
      const existing = await getWiki(slug);
      if (existing) {
        return reply.status(409).send({ error: 'A wiki with this slug already exists' });
      }

      const wiki = await createWiki(slug, title, req.user!.id, visibility);
      return reply.status(201).send({ wiki });
    },
  );
}
