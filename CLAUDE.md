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
