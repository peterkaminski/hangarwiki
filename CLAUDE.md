# CLAUDE.md — HangarWiki

## What is this?

HangarWiki is a git-native wiki engine. Markdown pages live in a Forgejo-hosted git repo. Users edit via a web UI (CodeMirror) or git push. Identity is keypair-based with magic-link email for easy access.

See `PRODUCT.md` for full product definition, `ARCHITECTURE.md` for technical design, and `PROJECT-PLAN.md` for the phased build plan.

## Stack

- **Monorepo**: npm workspaces (`packages/server`, `packages/web`)
- **Server**: Node.js + TypeScript + Fastify
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Editor**: CodeMirror 6
- **Database**: SQLite via Drizzle ORM
- **Git**: Shell out to git CLI (wrapped in GitService). No isomorphic-git or nodegit.
- **Forge API**: Gitea-compatible baseline + feature-gated Forgejo extensions
- **Markdown**: unified/remark pipeline (shared between server and web)
- **Email**: Postmark, Resend, or Mailgun (pluggable)
- **Auth**: Magic link email + Ed25519 keypairs
- **Reverse proxy**: Caddy (no nginx)

## Development Commands

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start server + client in dev mode
npm run build        # Build everything for production
npm run test         # Run all tests
```

## Key Conventions

- Page files are Markdown with spaces in filenames: `My Page.md`
- Folders supported for organization: `Projects/My Project.md`
- Wikilinks: `[[Page Name]]` and `[[Page Name|display text]]`
- Embeds: `![[Page Name]]` for transclusion
- Each wiki = one git repo (Forgejo or Gitea)
- Git commits attributed to the actual user, not a service account
- URLs use underscores for spaces (MarkPub-style): `/wiki-slug/My_Cool_Page`
- Path scrubbing: spaces, `?`, `#`, `%`, `"` → `_` (collapsed). Case-insensitive resolution.
- Wikilink resolution is case-insensitive, searches across all folders

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
| `DEBT.md` | Known tech debt |

**When building features:** update PROJECT-PLAN.md (check off items) and WISHLIST.md (mark done) in the same commit as the code. If the feature changes the DB schema, routes, or directory structure, update ARCHITECTURE.md too.

**Periodically:** review PRODUCT.md feature lists and ARCHITECTURE.md for drift from reality.
