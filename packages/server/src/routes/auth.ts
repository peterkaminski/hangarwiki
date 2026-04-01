import { FastifyInstance } from 'fastify';
import { requestMagicLink, verifyMagicLink, invalidateSession, exportPrivateKey, updateUser } from '../services/auth.js';
import { getLastConsoleMail } from '../services/email.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

export async function authRoutes(app: FastifyInstance) {
  /** Request a magic link email. */
  app.post<{ Body: { email: string } }>('/api/auth/login', async (req, reply) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return reply.status(400).send({ error: 'Valid email is required' });
    }

    await requestMagicLink(email);
    return { ok: true, message: 'Check your email for a sign-in link' };
  });

  /** Verify a magic link token and create a session. */
  app.get<{ Querystring: { token: string } }>('/api/auth/verify', async (req, reply) => {
    const { token } = req.query;

    if (!token) {
      return reply.status(400).send({ error: 'Token is required' });
    }

    try {
      const { sessionToken, user } = await verifyMagicLink(token);

      reply.setCookie('session', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: config.appUrl.startsWith('https'),
        sameSite: 'lax',
        maxAge: config.sessionExpiryDays * 24 * 60 * 60,
      });

      // Redirect to app (frontend will read user from /api/auth/me)
      return reply.redirect(`${config.appUrl}/`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return reply.status(400).send({ error: message });
    }
  });

  /** Get the current authenticated user. */
  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return { user: req.user };
  });

  /** Update current user's profile. */
  app.patch<{ Body: { displayName?: string } }>('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    const { displayName } = req.body;
    const user = await updateUser(req.user!.id, { displayName });
    return { user };
  });

  /** Logout — invalidate the current session. */
  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const token = req.cookies?.session;
    if (token) {
      await invalidateSession(token);
    }

    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });

  /** Test helper: get the last magic link URL (dev only — requires console email + non-production). */
  if (config.emailProvider === 'console' && process.env.NODE_ENV !== 'production') {
    app.get('/api/auth/test/last-magic-link', async (_req, reply) => {
      const mail = getLastConsoleMail();
      if (!mail) return reply.status(404).send({ error: 'No email sent yet' });
      const match = mail.textBody.match(/(http\S+\/api\/auth\/verify\S+)/);
      if (!match) return reply.status(404).send({ error: 'No verify URL found' });
      return { url: match[1] };
    });
  }

  /** Export the user's private key (for git SSH access). */
  app.get('/api/auth/export-key', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const privateKey = await exportPrivateKey(req.user!.id);
      return { privateKey };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Key export failed';
      return reply.status(400).send({ error: message });
    }
  });
}
