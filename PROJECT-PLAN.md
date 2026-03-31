# HangarWiki — Project Plan

## Phase 1: Foundation (MVP)

A single-user-testable wiki that can create pages, edit them in the browser, and persist to git.

### Milestone 1.1 — Project Scaffolding
- [x] Initialize monorepo (npm workspaces)
- [x] Set up TypeScript configs (base + per-package)
- [x] Set up server package (Fastify + TypeScript)
- [x] Set up web package (Vite + React + Tailwind + TypeScript)
- [x] Dev workflow: `npm run dev` starts both server and client (concurrently)
- [x] Docker Compose for local Forgejo instance (dev environment)
- [x] Basic CLAUDE.md for the project

### Milestone 1.2 — Git Service
- [x] `GitService` class wrapping git CLI operations
- [x] Init/clone repo
- [x] Read file, list files
- [x] Commit with author identity
- [x] Push/pull to remote
- [x] Diff and log (file history)
- [x] Conflict detection on push
- [x] Unit tests with temp repos

### Milestone 1.3 — Forge Integration (Gitea/Forgejo)
- [x] Forge API client: Gitea-compatible baseline with capability detection
- [x] Server flavor/version detection on startup
- [x] Feature-gating for Forgejo-specific endpoints
- [x] Create/delete repository
- [x] Register deploy keys (server access)
- [x] Register user SSH keys
- [x] Configure push webhooks
- [ ] Webhook receiver endpoint
- [ ] Integration tests against local Forgejo (and ideally Gitea)

### Milestone 1.4 — Database & Auth
- [x] SQLite setup with Drizzle ORM
- [x] Schema: users, sessions, magic_links, wikis, wiki_members
- [ ] Migrations infrastructure (using CREATE IF NOT EXISTS for now)
- [x] Magic link flow: request -> email -> verify -> session
- [x] Email sending (Postmark/Resend/Mailgun for prod, log-to-console for dev)
- [x] Session middleware (cookie-based)
- [x] Keypair generation (Ed25519) on user creation
- [x] Key export endpoint
- [x] Auth middleware (protect routes)

### Milestone 1.5 — Page CRUD API
- [x] REST endpoints: list pages, get page, create page, update page
- [x] Page history endpoint (git log for file)
- [ ] Wikilink extraction (parse `[[links]]` from content)
- [ ] Backlinks query (which pages link to this page?)
- [x] Page delete (with git commit)
- [ ] Attachment upload endpoint
- [x] Error handling (conflicts, not found, permissions)

### Milestone 1.6 — Markdown Pipeline
- [ ] Remark-based pipeline (parse -> transform -> render)
- [ ] Custom wikilink plugin (`[[Page Name]]`, `[[Page|display]]`)
- [ ] Wikilink resolution (link to actual page URLs)
- [ ] Frontmatter extraction
- [ ] HTML sanitization
- [ ] Shared package importable by server and web
- [ ] Transclusion (`![[embed]]`) — basic support

### Milestone 1.7 — Web UI (Core)
- [ ] App shell: routing, layout, navigation
- [ ] Login page (magic link flow)
- [ ] Wiki home page (page list + _home.md)
- [ ] Page view (rendered Markdown with clickable wikilinks)
- [ ] Page edit with CodeMirror 6
  - [ ] Markdown syntax highlighting
  - [ ] Wikilink syntax highlighting
  - [ ] `[[` autocomplete (search existing pages)
  - [ ] Side-by-side preview
- [ ] Page history view
- [ ] Create new page
- [ ] Wiki settings (owner: title, visibility)
- [ ] User settings (display name, key export)
- [ ] Basic responsive layout

### Milestone 1.8 — MVP Integration & Testing
- [ ] End-to-end flow: login -> create wiki -> create page -> edit -> view history
- [ ] Git push from external client updates wiki in real-time (webhook)
- [ ] Web edit + git push conflict scenario works
- [ ] Basic error states handled in UI
- [ ] Deploy to a test server alongside Forgejo

---

## Phase 2: Collaboration & Content

### Milestone 2.1 — Real-Time Collaboration
- [ ] Yjs CRDT integration
- [ ] y-codemirror.next binding
- [ ] WebSocket server for sync
- [ ] Presence indicators (who's editing)
- [ ] Periodic auto-save to git

### Milestone 2.2 — Conflict Resolution UI
- [ ] Detect conflict on push (server-side)
- [ ] Three-way merge view in browser
- [ ] Accept theirs / accept mine / manual merge
- [ ] Resolve and commit

### Milestone 2.3 — Rich Content
- [ ] Transclusion rendering (inline embedded pages)
- [ ] Backlinks panel in page view
- [ ] Tags: parse from frontmatter, tag index page
- [ ] File attachments: drag-and-drop upload in editor
- [ ] Image preview in editor
- [ ] Full-text search (SQLite FTS5)

### Milestone 2.4 — Navigation & Discovery
- [ ] Sidebar navigation (`_sidebar.md` or auto-generated)
- [ ] Recently changed pages
- [ ] Graph view (page link visualization) — stretch goal
- [ ] Orphan pages (no incoming links)
- [ ] Search with result highlighting

---

## Phase 3: Polish & Administration

### Milestone 3.1 — Admin & Management
- [ ] Admin dashboard
- [ ] User management (invite, remove, change roles)
- [ ] Wiki analytics (edit frequency, active contributors)
- [ ] Bulk operations (archive wiki, export)

### Milestone 3.2 — Customization
- [ ] Wiki templates (starter content for new wikis)
- [ ] Page templates
- [ ] Custom CSS per wiki
- [ ] Configurable sidebar

### Milestone 3.3 — Notifications
- [ ] Watch pages for changes
- [ ] Email digest (daily/weekly)
- [ ] Activity feed (recent changes across wikis)

### Milestone 3.4 — Hardening
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] Security audit of auth flow
- [ ] Performance profiling (large wikis)
- [ ] Backup/restore tooling
- [ ] Documentation (user guide, admin guide, API docs)

---

## Resolved Questions

1. **Git library vs CLI**: Git CLI only. No isomorphic-git or nodegit — simpler, fewer deps, nothing to maintain.

2. **Forge API**: Gitea-compatible API as baseline. Detect server flavor/version early. Feature-gate Forgejo-only endpoints. Graceful degradation over strict checks. Design for "common API + server-specific extensions."

3. **Email provider**: Postmark, Resend, or Mailgun (not SES). Pluggable provider interface.

4. **Real-time sync**: Every keystroke (Yjs default). Better UX, acceptable bandwidth for 20-50 users.

5. **Page naming**: MarkPub-style path scrubbing — spaces and `? # % "` become underscores in URLs. Case-insensitive resolution. Colons, commas, hyphens, periods preserved. See ARCHITECTURE.md for full table.

6. **Scaling**: Everything in one repo is fine for the target scale (5-50 people). Not a concern now.

7. **Folders**: Supported. Folder hierarchy like Obsidian/MarkPub. Wikilinks resolve across all folders.

8. **Reverse proxy**: Caddy only (automatic HTTPS). No nginx.

## Resolved Questions (continued)

7. **Folder depth**: Freeform, no cap.

8. **Wikilink ambiguity**: Closest folder first, otherwise non-deterministic (MarkPub approach). Users can disambiguate with `[[Folder/Page Name]]` if needed, but we don't require it.

9. **Email provider**: Postmark first (better deliverability reputation). The slightly rougher DX forces us to build clean abstractions. Resend as a first-class alternative ASAP after.
