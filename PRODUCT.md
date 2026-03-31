# HangarWiki — Product Definition

## Vision

HangarWiki is a lightweight, git-native wiki engine designed for small teams and learning cohorts (5–50 people). It stores all content as Markdown files in a Forgejo-hosted git repository, giving users the choice of editing through a polished web UI or directly via git with their favorite tools (Obsidian, VS Code, etc.).

Identity is built on public-key cryptography — simple enough for non-technical users (magic-link email signup), powerful enough for technical users (keypair-based git auth). Inspired by the Nostr identity model: your keypair *is* your identity.

## Target Users

- **Small collaborative teams** (5–20 people) building a shared knowledge base
- **Course cohorts** (20–50 people) where an instructor or facilitator sets up the wiki and participants contribute
- **Power users** who want to edit wiki content locally in Obsidian or VS Code and push via git

## Core Principles

1. **Git is the source of truth.** Every page, attachment, and edit lives in a git repo. History is git history. Conflicts are git conflicts.
2. **Two editing surfaces, one repo.** Web UI and git push are equally valid ways to edit. Neither is second-class.
3. **Simple identity, real crypto.** Users get a keypair on signup. Magic links for easy access, keypair for git auth and content signing. No passwords.
4. **Obsidian-compatible Markdown.** `[[wikilinks]]`, `[[Page Name|display text]]`, `![[embeds]]`, frontmatter, tags — content should round-trip cleanly with Obsidian.
5. **Runs alongside Forgejo.** Shares a server, uses Forgejo's API for repo management, but has its own auth and UI.

## Key Features

### Phase 1 — MVP
- Create and manage wiki instances (each backed by a Forgejo git repo)
- Web-based Markdown editor with CodeMirror (syntax highlighting, preview)
- `[[wikilink]]` resolution (Obsidian-style, by page title/filename)
- Page history (git log per file)
- Magic-link email authentication
- Keypair generation on signup (stored server-side, exportable)
- Basic access control: public-read or private wiki, authenticated editing
- Git clone/push support for power users (via keypair)
- SQLite for user/session/wiki metadata
- Forgejo API integration for repo lifecycle

### Phase 2 — Collaboration
- Real-time collaborative editing (CRDT-based, e.g., Yjs + CodeMirror)
- Conflict resolution UI for git-level conflicts (web merge editor)
- `![[transclusion]]` rendering
- Backlinks panel (pages that link to this page)
- File attachments and images (stored in repo, drag-and-drop upload)
- Tags and tag-based navigation
- Search (full-text across wiki content)

### Phase 3 — Polish & Scale
- Wiki templates and page templates
- Custom CSS/theming per wiki
- Activity feed / recent changes
- Notifications (email digest of changes)
- Admin dashboard (user management, wiki settings)
- Export (zip of repo, or just `git clone`)
- Federation considerations (cross-wiki linking?)

## Content Model

### Pages
- Stored as `.md` files in the repo, with optional folder hierarchy (like Obsidian/MarkPub)
- Filename derived from page title: `Page Name.md`
- Folders supported for organization: `Projects/My Project.md`
- Optional YAML frontmatter for metadata (tags, aliases, created date)
- Wikilinks resolve by filename match (case-insensitive, spaces = spaces in filename)
- Wikilink resolution searches across all folders: closest folder first, otherwise non-deterministic
- Disambiguate with `[[Folder/Page Name]]` when needed

### Attachments
- Stored in an `_attachments/` directory in the repo
- Referenced via `![[filename.png]]` or standard Markdown image syntax
- Versioned alongside pages

### Special Pages
- `_sidebar.md` — optional sidebar navigation
- `_footer.md` — optional footer content
- `_home.md` — wiki landing page

## Identity Model

### Signup Flow (Non-Technical)
1. User enters email address
2. Server generates an Ed25519 keypair for the user
3. Server sends a magic link to the email
4. User clicks link, arrives authenticated
5. Keypair is stored server-side (encrypted at rest)
6. User can optionally export their private key for git access or backup

### Signup Flow (Technical)
1. User generates their own keypair (CLI tool or web UI)
2. User registers with email + public key
3. Magic link confirms email
4. User uses their private key for git push (SSH) and content signing
5. Server only stores the public key

### Authentication
- **Web UI**: Magic link email -> session cookie (with configurable expiry)
- **Git over SSH**: Public key authentication against user's registered key
- **API**: Signed requests (optional, for integrations)

### Inspiration
- **Nostr**: Public key as identity, events signed by private key
- **SSH**: Battle-tested key-based auth for git operations
- Avoids passwords entirely — one less thing to manage and secure

## Technical Architecture

### Stack
- **Server**: Node.js + TypeScript + Fastify
- **Frontend**: React + TypeScript + Tailwind CSS + Vite
- **Editor**: CodeMirror 6 (with Markdown + wikilink extensions)
- **Database**: SQLite (via better-sqlite3 or Drizzle ORM)
- **Git operations**: Shell out to `git` CLI (no isomorphic-git or nodegit)
- **Forge integration**: REST API client targeting Gitea-compatible API as baseline, with feature-gated Forgejo-specific extensions. Graceful degradation over strict server checks.
- **Email**: Transactional email provider (Postmark, Resend, or Mailgun)
- **Auth**: Custom magic-link + keypair system
- **Deployment**: Runs as a systemd service alongside Forgejo, behind Caddy reverse proxy

### Data Flow

```
                    ┌─────────────┐
                    │   Forgejo    │
                    │  (git host)  │
                    └──────┬──────┘
                           │ API + git push/pull
                           │
┌──────────┐       ┌──────┴──────┐       ┌──────────┐
│  Browser  │◄────►│  HangarWiki │◄────►│  SQLite   │
│  (React)  │ HTTP │  (Node.js)  │       │ (metadata)│
└──────────┘       └──────┬──────┘       └──────────┘
                           │
                    ┌──────┴──────┐
                    │  Local git   │
                    │  clone/push  │
                    │  (power user)│
                    └─────────────┘
```

### Server Responsibilities
- Serve the React SPA
- REST API for page CRUD, wiki management, auth
- Sync with Forgejo repo (pull on read, commit+push on write)
- Handle magic-link auth flow (email sending)
- Manage SSH key registration with Forgejo (for git push access)
- Resolve wikilinks and render Markdown server-side (for previews, SEO)
- Webhook endpoint to detect external pushes and update local state

### Repo Structure (per wiki)
```
wiki-name/
├── _home.md
├── _sidebar.md          (optional)
├── _footer.md           (optional)
├── _attachments/
│   ├── diagram.png
│   └── photo.jpg
├── Page One.md
├── Another Page.md
├── Projects/
│   ├── Project Alpha.md
│   └── Project Beta.md
└── .hangarwiki.json     (wiki config: title, visibility, etc.)
```

## Access Control

### Wiki-Level Permissions
- **Public wiki**: Anyone can read, authenticated users can edit
- **Private wiki**: Only members can read and edit
- **Roles**: Owner (full control), Editor (read + write), Viewer (read only)

### Per-Wiki Membership
- Owner invites members by email
- Invitee receives magic link, creates account if needed
- Owner assigns role (editor or viewer)

## Non-Goals (for now)

- Plugin/extension system
- WYSIWYG block editor (CodeMirror with preview is the sweet spot)
- Mobile-native apps (responsive web is sufficient)
- Self-hosted Forgejo provisioning (assumes Forgejo is already running)
- Multi-server federation
