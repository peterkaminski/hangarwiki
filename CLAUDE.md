# CLAUDE.md — HangarWiki

<!-- Last reviewed: 2026-04-16 | Last commit at review: dbd3d76 -->
<!-- If `git log --oneline <commit>..HEAD | wc -l` shows 10+ commits, suggest a CLAUDE.md refresh. -->

## What is this?

HangarWiki is a git-native wiki engine. Markdown pages live in a Forgejo-hosted git repo. Users edit via a web UI (CodeMirror) or git push. Identity is keypair-based with magic-link email for easy access.

See `PRODUCT.md` for full product definition, `ARCHITECTURE.md` for technical design, and `PROJECT-PLAN.md` for the phased build plan.

## Freshness check

This file has a review datestamp in the HTML comment at the top. At the start of a session, run:

```bash
git log --oneline $(sed -n 's/.*Last commit at review: \([a-f0-9]*\).*/\1/p' CLAUDE.md)..HEAD | wc -l
```

If the result is **10 or more commits**, suggest: *"CLAUDE.md is stale — want me to review the repo and refresh it?"*

## Stack

- **Monorepo**: npm workspaces — `packages/server`, `packages/web`, `packages/shared`
- **Server**: Node.js 20+ · TypeScript · Fastify 5 · tsx (dev) · vitest (test)
- **Frontend**: React 19 · TypeScript · Vite 6 · Tailwind CSS 3 · react-router-dom 7
- **Editor**: CodeMirror 6 (with custom wikilink highlighting + autocomplete extensions)
- **Database**: SQLite via better-sqlite3 + Drizzle ORM (no migrations yet — uses `CREATE IF NOT EXISTS`)
- **Git**: Shell out to git CLI (wrapped in `GitService`). No isomorphic-git or nodegit.
- **Forge API**: Gitea-compatible baseline + feature-gated Forgejo extensions (`ForgeClient`)
- **Markdown**: unified/remark pipeline in `packages/shared` (shared between server and web)
- **Email**: Postmark, Resend, or console (pluggable via `EMAIL_PROVIDER` env var)
- **Auth**: Magic link email + Ed25519 keypairs (`@noble/ed25519`)
- **Reverse proxy**: Caddy (no nginx)

## Development Commands

```bash
npm install            # Install all workspace dependencies
npm run dev            # Start server (tsx watch :4000) + client (vite :5173) via concurrently
npm run build          # Build server (tsc) then web (vite build)
npm test               # Run server-side vitest tests (71 tests across 7 files)
npm run lint           # ESLint across all packages

# Targeted test runs
npx vitest run packages/server/src/services/git.test.ts
npx vitest run -t "wikilink"

# E2E (requires running dev server + Forgejo)
npx playwright test
```

### Environment setup

Copy `env.sh-template` to `env.sh` and fill in values. Key vars: `FORGE_URL`, `FORGE_API_TOKEN`, `FORGE_SSH_PORT`, `ENCRYPTION_KEY`, `WEBHOOK_SECRET`, `EMAIL_PROVIDER`.

The dev Docker Compose spins up a local Forgejo instance on port 3000 (SSH 2222).

## Project structure

```
packages/
├── server/src/
│   ├── index.ts              # Fastify entry point
│   ├── config.ts             # Env-var config (getters, re-readable in tests)
│   ├── routes/
│   │   ├── auth.ts           # Magic link, session management
│   │   ├── pages.ts          # Page CRUD, history, search, backlinks, diff
│   │   ├── wikis.ts          # Wiki lifecycle, import, settings
│   │   ├── attachments.ts    # File upload + serving from _attachments/
│   │   └── webhooks.ts       # Forgejo push notifications (HMAC-verified)
│   ├── services/
│   │   ├── git.ts            # Git CLI wrapper (commit, push, pull, diff)
│   │   ├── forge.ts          # Gitea/Forgejo API client
│   │   ├── email.ts          # Email provider abstraction
│   │   ├── paths.ts          # Filename ↔ title ↔ URL path conversion
│   │   ├── auth.ts           # Keypair gen, magic link, sessions
│   │   ├── wiki.ts           # Wiki/page management, FTS5 search, backlinks
│   │   ├── ssh.ts            # SSH key management
│   │   ├── crypto.ts         # Ed25519 keygen, AES-256-GCM encrypt/decrypt
│   │   └── attachments.ts    # Attachment storage
│   ├── db/schema.ts          # Drizzle ORM schema (users, sessions, wikis, etc.)
│   └── middleware/           # Auth, error handling
├── web/src/
│   ├── pages/                # Route-level React components
│   │   ├── WikiList.tsx      # Wiki list + create/import
│   │   ├── WikiHome.tsx      # Page list, search, recent changes, orphan pages
│   │   ├── WikiSettings.tsx  # Title, visibility, incipient link style
│   │   ├── PageView.tsx      # Rendered markdown + sidebar + backlinks panel
│   │   ├── PageEdit.tsx      # Editor with side-by-side preview
│   │   ├── PageHistory.tsx   # Commit log with inline diffs
│   │   ├── UserSettings.tsx  # Display name, SSH key export
│   │   └── Login.tsx         # Magic link login
│   ├── components/
│   │   ├── Editor.tsx        # CodeMirror wrapper (shortcuts, drag-drop upload)
│   │   ├── wikilinkComplete.ts   # [[autocomplete extension
│   │   ├── wikilinkHighlight.ts  # Wikilink syntax highlighting
│   │   └── imagePreview.ts       # Image preview in editor
│   └── lib/
│       ├── api.ts            # API client
│       └── markdown.ts       # Client-side MD rendering (uses shared)
├── shared/src/markdown/      # Shared between server and web
│   ├── wikilink.ts           # Wikilink parser/extractor
│   └── render.ts             # unified/remark Markdown→HTML pipeline
├── e2e/                      # Playwright end-to-end tests
│   └── wiki-flow.spec.ts
└── adr/                      # Architecture Decision Records
    └── 001-test-magic-link-endpoint.md
```

Tests are co-located with source files (`*.test.ts` next to `*.ts`).

## Key Conventions

- Page files are Markdown with spaces in filenames: `My Page.md`
- Folders supported for organization: `Projects/My Project.md`
- Wikilinks: `[[Page Name]]` and `[[Page Name|display text]]`
- Embeds: `![[Page Name]]` for transclusion
- Each wiki = one git repo (Forgejo or Gitea)
- Git commits attributed to the actual user, not a service account
- URLs use underscores for spaces (MarkPub-style): `/wiki-slug/My_Cool_Page`
- Path scrubbing: spaces, `?`, `#`, `%`, `"` → `_` (collapsed). Case-insensitive resolution.
- Wikilink resolution is case-insensitive, searches across all folders, closest folder first

## Current state (Phase 1 nearly complete)

Phase 1 (Foundation/MVP) is ~95% done. All milestones 1.1–1.7 are complete. From 1.8, what remains:
- [ ] Web edit + git push conflict scenario
- [ ] Deploy to a test server alongside Forgejo

From Phase 2, these are already implemented:
- Transclusion rendering, backlinks panel, file attachments, image preview
- Full-text search (FTS5), sidebar navigation, recent changes, orphan pages

See `PROJECT-PLAN.md` for the full checklist and `DEBT.md` for known shortcuts.

## Known gotchas

- **No migrations**: DB uses `CREATE TABLE IF NOT EXISTS`. Schema changes require manual intervention or a fresh DB until Drizzle Kit migrations are wired up.
- **Backlinks cold-start**: `page_links` table only populates on page save — existing pages from git push won't have backlinks indexed until re-saved or a reindex is built.
- **Config via getters**: `config.ts` reads `process.env` on every access (not cached at import time), which is how tests override config in `beforeEach`.
- **`resetDb()` in tests**: Tests call `resetDb()` to clear the singleton DB between runs.
- **E2E test data**: Playwright tests create wikis but don't clean up — they accumulate in the dev DB.

## Documentation

Root-level docs to keep in sync with the codebase:

| Doc | Purpose |
|---|---|
| `PRODUCT.md` | Product definition, feature phases |
| `ARCHITECTURE.md` | Technical design, directory structure, DB schema |
| `PROJECT-PLAN.md` | Phased build plan with checkboxes |
| `WISHLIST.md` | Ideas not yet in the plan; mark items done as they're built |
| `USER-GUIDE.md` | End-user guide (instance/wiki/page model, workflows) |
| `DEPLOYMENT.md` | Production deployment (Hetzner, Forgejo, Caddy, multi-instance) |
| `INSTALLATION.md` | Local dev setup |
| `DEBT.md` | Known tech debt and test gaps |
| `TESTING.md` | Test runner commands, what's tested and what isn't |
| `CHANGELOG.md` | Release notes |
| `CONTRIBUTING.md` | Contribution guidelines |
| `GLOSSARY.md` | Terminology reference |

**When building features:** update PROJECT-PLAN.md (check off items) and WISHLIST.md (mark done) in the same commit as the code. If the feature changes the DB schema, routes, or directory structure, update ARCHITECTURE.md too.

**Periodically:** review PRODUCT.md feature lists and ARCHITECTURE.md for drift from reality.
