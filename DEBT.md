# HangarWiki — Testing & Prototype Debt

Track things that work but aren't fully tested, hardcoded assumptions, and known shortcuts that need revisiting.

## Forge Integration

- [ ] **ForgeClient webhook type hardcoded to `'forgejo'`** — The `createWebhook` method sets `type: 'forgejo'`. Gitea expects `type: 'gitea'`. Should detect flavor and set accordingly. Needs real testing against both. *(forge.ts)*
- [ ] **No integration tests against live Forgejo** — ForgeClient is structurally complete but entirely untested against an actual server. Need to spin up Docker Compose Forgejo and run through repo create, deploy key, webhook flow. *(forge.ts)*
- [ ] **No Gitea testing at all** — The "Gitea-compatible baseline" claim is design intent, not verified. Should add a Gitea container to docker-compose.yml and test the same flows. *(forge.ts)*
- [ ] **Capability detection is flavor-only** — `detectServer()` checks the version string for "forgejo" but doesn't probe for specific API capabilities. Feature-gating is a stub pattern, not exercised yet. *(forge.ts)*

## Git Service

- [ ] **Push/pull not tested with a real remote** — Unit tests use local temp repos only. Push, pull, fetch, and conflict detection need integration tests with a Forgejo SSH remote. *(git.test.ts)*
- [ ] **Conflict resolution path untested** — `pull()` returns false on CONFLICT but we haven't tested the actual merge conflict scenario or recovery from it. *(git.ts)*
- [ ] **`clone()` untested** — Only `init()` is exercised in tests. *(git.test.ts)*

## Path Handling

- [ ] **URL-to-file reverse lookup is naive** — `urlPathToSearchPattern` replaces underscores with spaces, but the original filename might have had actual underscores. Need to fall back to index lookup. *(paths.ts)*
- [ ] **No tests for deeply nested folder resolution** — Wikilink resolution tested with 1 level of folders. Should test 3+ levels. *(paths.test.ts)*

## Auth & Crypto

- [ ] **No rate limiting on magic link requests** — Anyone can spam POST /api/auth/login and trigger emails. Need rate limiting per email and per IP. *(routes/auth.ts)*
- [ ] **No CSRF protection** — State-changing endpoints (login, logout) have no CSRF tokens. Fastify has `@fastify/csrf-protection`. *(routes/auth.ts)*
- [ ] **PEM-to-OpenSSH conversion assumes fixed DER layout** — `pemToOpenSSH` assumes Ed25519 SPKI DER has a 12-byte header. Should verify this holds across Node.js versions, or use a library. *(crypto.ts)*
- [ ] **No proper migration system** — Using `CREATE TABLE IF NOT EXISTS` instead of versioned migrations. Fine for dev, needs Drizzle Kit migrations before any production use. *(db/index.ts)*
- [ ] **Magic link email HTML is inline** — Should use proper email templates. Currently just inline HTML string. *(services/auth.ts)*
- [ ] **Postmark/Resend providers untested against real APIs** — Only console provider exercised. Need integration test with real credentials. *(services/email.ts)*

## General

- [ ] **No error handling middleware** — Server has no global error handler or structured error responses yet. *(index.ts)*
- [ ] **No request validation** — No schema validation on API inputs (Fastify has built-in support via JSON Schema, not wired up). *(index.ts)*
- [ ] **`maxBuffer` on git CLI calls** — Set to 10MB, which is fine for now but could be hit with large diffs or repos. Not instrumented. *(git.ts)*
