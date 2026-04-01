import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import {
  listPages,
  getPage,
  savePage,
  deletePage,
  getPageHistory,
  resolvePagePath,
  checkAccess,
  getWiki,
  getBacklinks,
} from '../services/wiki.js';
import { titleToFilename } from '../services/paths.js';

export async function pageRoutes(app: FastifyInstance) {
  /** List all pages in a wiki. */
  app.get<{ Params: { wiki: string } }>(
    '/api/wikis/:wiki/pages',
    async (req, reply) => {
      const { wiki } = req.params;

      const canView = await checkAccess(wiki, req.user?.id, 'viewer');
      if (!canView) return reply.status(403).send({ error: 'Access denied' });

      const pages = await listPages(wiki);
      return { pages };
    },
  );

  /** Get a single page by URL path. */
  app.get<{ Params: { wiki: string; '*': string } }>(
    '/api/wikis/:wiki/pages/*',
    async (req, reply) => {
      const { wiki } = req.params;
      const urlPath = req.params['*'];

      const canView = await checkAccess(wiki, req.user?.id, 'viewer');
      if (!canView) return reply.status(403).send({ error: 'Access denied' });

      const pagePath = await resolvePagePath(wiki, urlPath);
      if (!pagePath) return reply.status(404).send({ error: 'Page not found' });

      const page = await getPage(wiki, pagePath);
      if (!page) return reply.status(404).send({ error: 'Page not found' });

      return { page };
    },
  );

  /** Get page history. */
  app.get<{ Params: { wiki: string; '*': string }; Querystring: { limit?: string } }>(
    '/api/wikis/:wiki/history/*',
    async (req, reply) => {
      const { wiki } = req.params;
      const urlPath = req.params['*'];

      const canView = await checkAccess(wiki, req.user?.id, 'viewer');
      if (!canView) return reply.status(403).send({ error: 'Access denied' });

      const pagePath = await resolvePagePath(wiki, urlPath);
      if (!pagePath) return reply.status(404).send({ error: 'Page not found' });

      const limit = parseInt(req.query.limit ?? '50', 10);
      const history = await getPageHistory(wiki, pagePath, limit);
      return { history };
    },
  );

  /** Get backlinks for a page (which pages link to this one). */
  app.get<{ Params: { wiki: string; '*': string } }>(
    '/api/wikis/:wiki/backlinks/*',
    async (req, reply) => {
      const { wiki } = req.params;
      const urlPath = req.params['*'];

      const canView = await checkAccess(wiki, req.user?.id, 'viewer');
      if (!canView) return reply.status(403).send({ error: 'Access denied' });

      const pagePath = await resolvePagePath(wiki, urlPath);
      if (!pagePath) return reply.status(404).send({ error: 'Page not found' });

      const backlinks = await getBacklinks(wiki, pagePath);
      return { backlinks };
    },
  );

  /** Create or update a page. */
  app.put<{
    Params: { wiki: string };
    Body: { path?: string; title?: string; content: string; message?: string };
  }>(
    '/api/wikis/:wiki/pages',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { wiki } = req.params;
      const { content, message } = req.body;

      const canEdit = await checkAccess(wiki, req.user!.id, 'editor');
      if (!canEdit) return reply.status(403).send({ error: 'Access denied' });

      // Determine page path: explicit path, or derive from title
      let pagePath = req.body.path;
      if (!pagePath && req.body.title) {
        pagePath = titleToFilename(req.body.title);
      }
      if (!pagePath) {
        return reply.status(400).send({ error: 'Either path or title is required' });
      }

      if (!content && content !== '') {
        return reply.status(400).send({ error: 'Content is required' });
      }

      const author = {
        name: req.user!.displayName ?? req.user!.email,
        email: req.user!.email,
      };

      const page = await savePage(wiki, pagePath, content, author, message);
      return { page };
    },
  );

  /** Delete a page. */
  app.delete<{ Params: { wiki: string; '*': string } }>(
    '/api/wikis/:wiki/pages/*',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { wiki } = req.params;
      const urlPath = req.params['*'];

      const canEdit = await checkAccess(wiki, req.user!.id, 'editor');
      if (!canEdit) return reply.status(403).send({ error: 'Access denied' });

      const pagePath = await resolvePagePath(wiki, urlPath);
      if (!pagePath) return reply.status(404).send({ error: 'Page not found' });

      const author = {
        name: req.user!.displayName ?? req.user!.email,
        email: req.user!.email,
      };

      await deletePage(wiki, pagePath, author);
      return { ok: true };
    },
  );
}
