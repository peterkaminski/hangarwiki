import { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { access, constants, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { checkAccess, saveAttachment, getWikiGit } from '../services/wiki.js';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

export async function attachmentRoutes(app: FastifyInstance) {
  /** Upload an attachment to a wiki. */
  app.post<{ Params: { wiki: string } }>(
    '/api/wikis/:wiki/attachments',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { wiki } = req.params;

      const canEdit = await checkAccess(wiki, req.user!.id, 'editor');
      if (!canEdit) return reply.status(403).send({ error: 'Access denied' });

      const file = await req.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      // 10MB limit
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of file.file) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) {
          return reply.status(413).send({ error: 'File too large (max 10MB)' });
        }
        chunks.push(chunk);
      }

      const data = Buffer.concat(chunks);
      const author = {
        name: req.user!.displayName ?? req.user!.email,
        email: req.user!.email,
      };

      const result = await saveAttachment(wiki, file.filename, data, author);
      return { attachment: result };
    },
  );

  /** Serve an attachment from a wiki's _attachments directory. */
  app.get<{ Params: { wiki: string; '*': string } }>(
    '/api/wikis/:wiki/attachments/*',
    async (req, reply) => {
      const { wiki } = req.params;
      const filename = req.params['*'];

      const canView = await checkAccess(wiki, req.user?.id, 'viewer');
      if (!canView) return reply.status(403).send({ error: 'Access denied' });

      // Prevent path traversal
      if (filename.includes('..') || filename.startsWith('/')) {
        return reply.status(400).send({ error: 'Invalid filename' });
      }

      const git = getWikiGit(wiki);
      const filePath = git.getFilePath(`_attachments/${filename}`);

      try {
        await access(filePath, constants.R_OK);
      } catch {
        return reply.status(404).send({ error: 'Attachment not found' });
      }

      const fileInfo = await stat(filePath);
      const ext = extname(filename).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Content-Length', fileInfo.size);
      reply.header('Cache-Control', 'public, max-age=86400');

      return reply.send(createReadStream(filePath));
    },
  );
}
