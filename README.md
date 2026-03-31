# HangarWiki

A git-native wiki engine for small teams and learning cohorts. Every page is a Markdown file in a git repo, editable through a polished web UI or directly via git push.

## What makes it different

- **Git is the source of truth.** Every edit is a commit. History is git history. Your content is never locked in.
- **Two editing surfaces.** Edit in the browser with a CodeMirror editor, or clone the repo and use Obsidian, VS Code, or any text editor. Neither is second-class.
- **Obsidian-compatible Markdown.** `[[wikilinks]]`, `[[Page|display text]]`, `![[embeds]]`, frontmatter, tags — content round-trips cleanly with Obsidian.
- **Keypair identity.** Users get an Ed25519 keypair on signup. Magic links for easy access, SSH keys for git auth. No passwords.
- **Runs alongside Forgejo.** Uses the Gitea-compatible API for repo management, with Forgejo-specific extensions where available.

## Status

**Under active development.** The core is functional — wiki creation, page CRUD, git-backed versioning, auth, and a Markdown pipeline with wikilink support — but not yet ready for production use. See [PROJECT-PLAN.md](PROJECT-PLAN.md) for the full roadmap and [DEBT.md](DEBT.md) for known shortcuts.

_This codebase is AI-generated in dialogue with humans. Not fully reviewed._

**What works today:**

- Create wikis (each backed by a local git repo)
- Create, edit, delete, and view pages with folder support
- Page history (git log per file)
- CodeMirror 6 editor with Markdown highlighting and side-by-side preview
- Magic-link email authentication with Ed25519 keypair generation
- Markdown rendering with `[[wikilink]]`, `![[embed]]`, and `![[image]]` support
- MarkPub-style URL path scrubbing (spaces become underscores)
- Case-insensitive wikilink resolution across folders
- XSS sanitization on rendered content

**What's next:**

- Forgejo integration (repo creation, webhooks, SSH key registration)
- Real-time collaborative editing (Yjs + CodeMirror)
- Full-text search
- Backlinks panel
- File attachments

## Quick start

See [INSTALLATION.md](INSTALLATION.md) for full setup instructions.

```bash
git clone https://github.com/peterkaminski/hangarwiki.git
cd hangarwiki
npm install
npm run dev
```

The server starts on `http://localhost:4000` and the frontend on `http://localhost:5173`.

## Stack

| Layer | Technology |
|---|---|
| Server | Node.js, TypeScript, Fastify |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Editor | CodeMirror 6 |
| Database | SQLite (Drizzle ORM) |
| Git | Shell out to `git` CLI |
| Markdown | unified/remark with custom wikilink plugin |
| Auth | Magic link email + Ed25519 keypairs |
| Email | Postmark (primary), Resend (alternative) |
| Reverse proxy | Caddy |

## Project structure

```
hangarwiki/
├── packages/
│   ├── server/          # Fastify API server
│   ├── web/             # React frontend (Vite)
│   └── shared/          # Shared Markdown pipeline
├── PRODUCT.md           # Product definition
├── ARCHITECTURE.md      # Technical design
├── PROJECT-PLAN.md      # Phased build plan
├── DEBT.md              # Testing & prototype debt tracker
├── INSTALLATION.md      # Setup guide
├── TESTING.md           # How to run tests
└── docker-compose.yml   # Local Forgejo for development
```

## Design documents

- [PRODUCT.md](PRODUCT.md) — Vision, target users, features, content model, identity model
- [ARCHITECTURE.md](ARCHITECTURE.md) — Technical decisions, data flow, URL scheme, deployment
- [PROJECT-PLAN.md](PROJECT-PLAN.md) — Phased milestones with progress tracking
- [DEBT.md](DEBT.md) — Known shortcuts and untested paths

## License

[MIT](LICENSE)
