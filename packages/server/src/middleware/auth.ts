import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession, type AuthUser } from '../services/auth.js';

// Extend Fastify's request type to include the authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/** Middleware that populates req.user if a valid session cookie exists. Does not reject unauthenticated requests. */
export async function optionalAuth(req: FastifyRequest, _reply: FastifyReply) {
  const token = req.cookies?.session;
  if (!token) return;

  const user = await validateSession(token);
  if (user) {
    req.user = user;
  }
}

/** Middleware that requires authentication. Returns 401 if no valid session. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies?.session;
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const user = await validateSession(token);
  if (!user) {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }

  req.user = user;
}
