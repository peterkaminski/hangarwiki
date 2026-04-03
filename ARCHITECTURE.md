# HangarWiki — Architecture

## System Overview

HangarWiki is a monorepo containing a Node.js/TypeScript backend and a React/TypeScript frontend. It runs as a single process serving both the API and the SPA, deployed alongside an existing Forgejo instance.

## Directory Structure

```
hangarwiki/
├── PRODUCT.md                 # Product definition
├── ARCHITECTURE.md            # This file
├── PROJECT-PLAN.md            # Phased build plan
├── packages/
│   ├── server/                # Backend (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts       # Entry point
│   │   │   ├── config.ts      # Configuration (env vars)
│   │   │   ├── routes/        # HTTP route handlers
│   │   │   │   ├── auth.ts    # Magic link, session management
│   │   │   │   ├── pages.ts   # Page CRUD, history, search, backlinks, diff
│   │   │   │   ├── wikis.ts   # Wiki lifecycle, import, settings
│   │   │   │   ├── attachments.ts  # File upload + serving from _attachments/
│   │   │   │   └── webhooks.ts # Forgejo push notifications (HMAC-verified)
│   │   │   ├── services/      # Business logic
│   │   │   │   ├── git.ts     # Git operations (commit, push, pull, diff)
│   │   │   │   ├── forge.ts   # Gitea/Forgejo API client (common + extensions)
│   │   │   │   ├── email.ts   # Email sending (Postmark, Resend, console)
│   │   │   │   ├── paths.ts   # Filename ↔ title ↔ URL path conversion
│   │   │   │   ├── auth.ts    # Keypair gen, magic link, sessions
│   │   │   │   └── wiki.ts    # Wiki/page management, FTS5 search, backlinks
│   │   │   ├── db/            # SQLite schema and queries
│   │   │   │   ├── schema.ts  # Drizzle ORM schema
│   │   │   │   └── migrations/
│   │   │   └── middleware/     # Auth, error handling
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                   # Frontend (React + Vite)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Editor.tsx            # CodeMirror wrapper (shortcuts, drag-drop upload)
│       │   │   ├── wikilinkComplete.ts   # [[autocomplete extension
│       │   │   └── wikilinkHighlight.ts  # Wikilink syntax highlighting extension
│       │   ├── pages/               # Route-level components
│       │   │   ├── WikiList.tsx     # Wiki list + create/import
│       │   │   ├── WikiHome.tsx     # Page list, search, recent changes
│       │   │   ├── WikiSettings.tsx # Wiki title, visibility, incipient link style
│       │   │   ├── PageView.tsx     # Rendered markdown + sidebar + backlinks
│       │   │   ├── PageEdit.tsx     # Editor with preview
│       │   │   ├── PageHistory.tsx  # Commit log with inline diffs
│       │   │   ├── UserSettings.tsx # Display name, SSH key export
│       │   │   └── Login.tsx
│       │   ├── hooks/
│       │   ├── lib/
│       │   │   ├── api.ts           # API client
│       │   │   └── markdown.ts      # Client-side MD rendering
│       │   └── styles/
│       ├── index.html
│       ├── package.json
│       ├── tailwind.config.ts
│       ├── vite.config.ts
│       └── tsconfig.json
├── package.json               # Workspace root
├── tsconfig.base.json
└── docker-compose.yml         # Optional: for local dev with Forgejo
```

## Key Technical Decisions

### 1. Git Strategy — Local Clone with Forgejo as Remote

Each wiki has a bare-ish local clone on the HangarWiki server. The flow:

**Web edit:**
1. User saves page via API
2. Server writes file to local working tree
3. Server commits with user identity (`Author: User Name <email>`)
4. Server pushes to Forgejo remote
5. On conflict (remote has diverged): pull, auto-merge if possible, push again
6. If auto-merge fails: present conflict to user in web UI

**External git push (power user):**
1. User pushes to Forgejo repo directly (SSH auth via their registered key)
2. Forgejo fires webhook to HangarWiki
3. HangarWiki pulls latest, updates any caches/indexes

**Why this approach:**
- Keeps Forgejo as the authoritative remote (standard git workflow)
- Local clone enables fast reads without API calls for every page view
- Commit authorship is preserved (each user has their own git identity)
- Power users interact with Forgejo directly, as they would any git repo

### 2. Git Library — Shelling Out to `git` CLI

Decision: shell out to `git` via `child_process`. No isomorphic-git, no nodegit.
- The server's environment has git installed (same machine as Forgejo)
- Simpler, fewer dependencies, full git feature support, nothing to maintain
- Wrap in a `GitService` class with typed methods

### 3. Markdown Pipeline

**Parser:** unified/remark ecosystem
- `remark-parse` for Markdown AST
- Custom remark plugin for `[[wikilink]]` and `![[embed]]` syntax
- `remark-frontmatter` for YAML metadata
- `remark-rehype` + `rehype-stringify` for HTML output
- Same pipeline runs server-side (API previews, SEO) and client-side (live preview)

**Shared package:** The Markdown pipeline should be a shared module importable by both server and web packages.

### 4. Editor — CodeMirror 6

- `@codemirror/lang-markdown` for base Markdown support
- Custom extension for wikilink syntax highlighting and autocomplete
- Custom extension for `[[` trigger -> page search autocomplete
- Preview pane (side-by-side or toggle) using the shared Markdown renderer
- Future: Yjs + `y-codemirror.next` for real-time collaboration

### 5. Database — SQLite via Drizzle ORM

SQLite stores metadata that doesn't belong in git:

```sql
-- Users and their keypairs
users (id, email, display_name, public_key, encrypted_private_key, created_at)

-- Active sessions (magic link flow)
sessions (id, user_id, token_hash, expires_at, created_at)

-- Magic link tokens (short-lived)
magic_links (id, user_id, email, token_hash, expires_at, used_at)

-- Wiki registry
wikis (id, slug, title, forge_owner, forge_repo, visibility, incipient_link_style, created_at)

-- Wiki membership
wiki_members (id, wiki_id, user_id, role, accepted_at)

-- Wikilink index (for backlinks queries)
page_links (id, wiki_id, source_path, target_title, target_title_lower)

-- Full-text search (FTS5 virtual table, not managed by Drizzle)
page_fts (wiki_id, page_path, title, content)  -- tokenize='porter unicode61'
```

### 6. Authentication Flow

```
┌─────────┐     1. POST /auth/login {email}      ┌──────────┐
│ Browser  │ ──────────────────────────────────►  │  Server   │
│          │                                       │           │
│          │     2. Email with magic link           │ Generate  │
│          │  ◄──────────────────────────────────  │ token,    │
│          │                                       │ send email│
│          │     3. GET /auth/verify?token=xxx      │           │
│          │ ──────────────────────────────────►  │ Verify    │
│          │                                       │ token,    │
│          │     4. Set-Cookie: session=yyy         │ create    │
│          │  ◄──────────────────────────────────  │ session   │
└─────────┘                                       └──────────┘
```

On first login, if user doesn't exist:
- Create user record
- Generate Ed25519 keypair
- Store public key + encrypted private key
- Register public key with Forgejo (API) for SSH git access
- User can later export private key from settings page

### 7. Forge Integration (Forgejo / Gitea)

**API client architecture:**
- Target the **Gitea-compatible API** as the baseline protocol
- Detect server flavor and version on startup (`/api/v1/version` + `/api/v1/settings/api`)
- Feature-gate newer or Forgejo-only endpoints behind capability checks
- Prefer graceful degradation over strict server-name checks
- Design as "common API plus server-specific extensions" to survive future Forgejo/Gitea divergence

**API usage:**
- Create repo when wiki is created
- Delete repo when wiki is deleted
- Register SSH keys for users (for git push access)
- Manage deploy keys (for server's own push/pull access)
- Configure webhooks (push events -> HangarWiki)

**Server's own access:**
- HangarWiki server has its own SSH key registered as a deploy key on each wiki repo
- Used for push/pull operations triggered by web edits

### 8. URL Scheme

```
/                              # Landing / wiki list
/login                         # Magic link login
/settings                      # User settings (key export, display name)
/:wiki                         # Wiki home page (_home.md)
/:wiki/:path+                  # View page (path may include folders)
/:wiki/:path+/edit             # Edit page
/:wiki/:path+/history          # Page history
/:wiki/_settings               # Wiki settings (owner only)
/:wiki/_members                # Member management
/:wiki/_search                 # Full-text search
```

**Path scrubbing (MarkPub-style):** Spaces and special characters in page names become underscores in URLs. Runs of scrubbed characters collapse to a single underscore.

| Character class | Scrubbed? |
|---|---|
| Space, `_`, `?`, `#`, `%`, `"` | Yes → `_` |
| Comma, colon, period, hyphen, parens | No (preserved) |

Examples:
- `My Cool Page.md` → `/wiki-name/My_Cool_Page`
- `Projects/Design Doc.md` → `/wiki-name/Projects/Design_Doc`
- `the 80% good enough claim.md` → `/wiki-name/the_80_good_enough_claim`

Resolution is **case-insensitive**: URL lookup lowercases and matches against a page index.

### 9. Deployment Architecture

```
┌─────────────────────────────────────┐
│              Caddy                   │
│  wiki.example.com -> :4000          │
│  git.example.com  -> :3000 (forgejo)│
└──────┬──────────────────┬───────────┘
       │                  │
┌──────▼──────┐   ┌──────▼──────┐
│ HangarWiki  │   │   Forgejo    │
│  :4000      │   │   :3000      │
│ (systemd)   │   │  (systemd)   │
└──────┬──────┘   └──────┬──────┘
       │                  │
       │    ┌─────────┐   │
       └───►│ SQLite  │   │
            └─────────┘   │
       │                  │
       └──── git SSH ─────┘
```

Both services behind Caddy (automatic HTTPS), different subdomains. HangarWiki communicates with Forgejo via API (HTTP) and git (SSH).

## Security Considerations

- Magic link tokens: short-lived (15 min), single-use, hashed in DB
- Sessions: httpOnly secure cookies, configurable expiry
- Private keys: encrypted at rest with a server-side secret (AES-256-GCM)
- Git commits: attributed to actual users (not a service account)
- Input sanitization: Markdown HTML output sanitized (no XSS via wiki content)
- Rate limiting: on magic link requests (prevent email spam)
- CSRF: token-based protection on state-changing endpoints
