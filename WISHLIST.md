# Wishlist

Ideas and feature requests that aren't yet in [PROJECT-PLAN.md](PROJECT-PLAN.md). These range from "definitely want" to "interesting, might not happen." Items that graduate to the plan get moved there.

---

## Import wiki from git repo

Import an existing Markdown wiki from a git URL or zip upload. This is the fastest way to get real content into HangarWiki.

**Phase 1 — Public repos:**
- Clone from a public HTTPS URL (e.g., `https://github.com/peterkaminski/arc-vault`)
- Upload a zip file containing Markdown files
- Auto-detect page structure (find `.md` files, derive titles, build page index)
- Create a new wiki backed by the cloned repo
- Handle repos that are already Obsidian vaults (frontmatter, wikilinks, attachments)

**Phase 2 — Private repos:**
- Authenticate with a GitHub/Gitea/Forgejo personal access token
- Support `gh` CLI auth (reuse existing token from `gh auth status`)
- SSH key-based clone using the user's HangarWiki keypair
- Periodic sync (pull from upstream on a schedule or webhook)

**Open questions:**
- Should import preserve the original git history, or squash into an initial commit?
- How to handle repos with non-Markdown files (images, PDFs, config files)?
- Should the wiki maintain an upstream remote for ongoing sync?

---

## Wiki export

Export a wiki as a zip of Markdown files, or as a git bundle. The content is always in git so this is partly just UX — making it obvious that your data isn't locked in.

---

## Themes / custom CSS

Per-wiki CSS customization. The incipient link tooltip text is already separated from code (it's in CSS, not JS) — extend this pattern to let wiki owners customize colors, fonts, and layout.

---

## Sidebar navigation

A `_sidebar.md` file (or auto-generated from folder structure) that renders as persistent navigation. Common in documentation wikis.

---

## Backlinks panel

Show "What links here" on every page — the list of pages containing wikilinks pointing to the current page. One of the most useful wiki navigation features. Already in PROJECT-PLAN.md Phase 2, but worth calling out as high-value.

---

## Full-text search

SQLite FTS5 for fast content search. Index page content on save. Already planned in Phase 2.

---

## Keyboard shortcuts in editor

- `Ctrl/Cmd+S` to save
- `Ctrl/Cmd+K` to insert a wikilink
- `Escape` to cancel editing
- `Ctrl/Cmd+Shift+P` to toggle preview

---

## RSS/Atom feed

Recent changes as a feed. Useful for following wiki activity from a feed reader without needing email notifications.

---

## Page templates

Pre-fill new pages with a template based on the folder or page type. E.g., meeting notes get a date/attendees/agenda skeleton.

---

## Diff view

Show what changed between two versions of a page. Git has the data — this is a UI feature to surface it.

---

## Mobile-friendly editing

The CodeMirror editor works on mobile but isn't optimized for it. A simplified mobile editing mode (maybe just a textarea) would lower the barrier to quick edits from a phone.

---

## API tokens

Let users generate API tokens for scripting. Useful for bots, CI/CD integration, and bulk operations.

---

## Email allowlist

Restrict who can sign in to the server by maintaining a list of allowed email addresses (or domains). If the allowlist is set, `POST /api/auth/login` rejects emails not on the list before sending the magic link. Useful for private instances where you don't want arbitrary signups.

Could be configured via environment variable (`ALLOWED_EMAILS=alice@example.com,bob@example.com`) or a `_config` table in SQLite for runtime management.

---

## MCP server

Expose HangarWiki as an MCP (Model Context Protocol) server so AI agents can interact with wikis as native tool calls. More useful than a CLI for agent workflows — structured inputs/outputs, no text parsing.

**Possible tools:**
- `list_wikis`, `get_wiki`, `create_wiki`, `import_wiki`
- `list_pages`, `get_page`, `create_page`, `update_page`, `search_pages`
- `get_backlinks`
- `manage_email_allowlist` — add/remove/list allowed emails (admin)
- `manage_members` — invite/remove wiki members, change roles
- `get_wiki_settings`, `update_wiki_settings`

Could run as a standalone process or be embedded in the existing Fastify server.

---

## Configurable home and sidebar page names

Set the filename used for the wiki home page and sidebar. Massive Wiki / MarkPub uses `README.md` for home and `Sidebar.md` for sidebar; HangarWiki currently uses `_home.md`. Should be configurable per-wiki with server-wide defaults.

**Per-wiki setting:** stored in wiki record (e.g., `homePageName`, `sidebarPageName`)
**Server-wide default:** environment variable or config (e.g., `DEFAULT_HOME_PAGE=README.md`)

---

## Visually differentiate external links vs. wikilinks

External links (`[text](https://...)`) and wikilinks (`[[Page Name]]`) should look different in rendered output so readers can tell at a glance whether a link stays in the wiki or leaves it. Needs design prototyping — common approaches (icon after external links, color differences, underline styles) all have tradeoffs. Worth looking at what MediaWiki, Notion, and Obsidian do, but none are great.

---

## Instance identity and branding

The navbar currently says "HangarWiki" and the wiki list says "Your Wikis." A community running their own instance would want their name front and center — "Collective Sense Commons" or "Acme Corp Wiki," not "HangarWiki."

Likely implementation: `INSTANCE_NAME` environment variable (or a `_config` table row) that replaces the default branding. Could extend to a logo/favicon and a custom tagline on the login page.

---

## Instance admin role

We have per-wiki owners, but no one "owns" the instance. A community deployment needs someone who can:

- See and manage all wikis (not just ones they created)
- Manage user accounts (deactivate, change roles)
- Set instance-level configuration (name, branding, email allowlist)
- View usage/activity across the whole instance

Could be as simple as an `is_admin` flag on the user record, set via environment variable on first boot (`ADMIN_EMAIL=alice@example.com`).

---

## Public landing page for logged-out users

Right now, logged-out users see a login form. A community instance might want:

- A welcome page explaining what this wiki is and who it's for
- A list of public wikis (if any exist)
- A "request access" flow instead of open signup

This ties into instance branding — the landing page is the front door.

---

## Mermaid / diagram support

Render Mermaid diagrams in Markdown fenced code blocks. Common in technical wikis.
