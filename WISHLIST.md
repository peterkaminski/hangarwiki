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

## Mermaid / diagram support

Render Mermaid diagrams in Markdown fenced code blocks. Common in technical wikis.
