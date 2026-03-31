# References

Other implementations and prior art that inform HangarWiki's design.

## MarkPub

**What it is:** A wiki/publishing engine developed by Peter Kaminski that establishes many of the conventions HangarWiki inherits.

**What we borrow:**

- **URL path scrubbing.** Spaces and special characters (`? # % "`) become underscores in URLs, with consecutive underscores collapsed. `My Cool Page.md` becomes `/My_Cool_Page`. This convention keeps URLs readable without percent-encoding.
- **Incipient links.** Links to pages that don't exist yet are rendered distinctively — underlined and highlighted, with a tooltip whose text is defined by the theme, not the application code. This separates content concerns (the link exists) from presentation concerns (how to explain it to the reader).
- **Case-insensitive page resolution.** Page names are matched case-insensitively, so `[[sandbox]]` and `[[Sandbox]]` resolve to the same page.

## MediaWiki

**What it is:** The wiki engine behind Wikipedia and thousands of other wikis. The dominant wiki platform.

**What we reference:**

- **Red links.** MediaWiki pioneered the convention of rendering links to nonexistent pages in red. These "red links" are one of the most powerful wiki growth mechanisms — they signal gaps that invite contribution. HangarWiki's "incipient links" serve the same purpose with different visual language.
- **Wikilink syntax.** The `[[Page Name]]` and `[[Page Name|display text]]` double-bracket syntax originated in early wiki engines and was popularized by MediaWiki. HangarWiki uses the same syntax.
- **Talk pages and namespaces** are MediaWiki concepts we deliberately do _not_ adopt. HangarWiki keeps things flat (folders, not namespaces) and leaves discussion to external tools.

## Obsidian

**What it is:** A personal knowledge management app that stores notes as local Markdown files.

**What we reference:**

- **Wikilink and embed syntax.** Obsidian uses `[[Page]]`, `[[Page|display]]`, and `![[embed]]` syntax. HangarWiki aims to be Obsidian-compatible so users can edit wiki content locally in Obsidian and push via git.
- **Frontmatter.** YAML frontmatter in Markdown files for metadata (tags, aliases, dates). HangarWiki strips frontmatter during rendering but preserves it in the file.
- **Graph view and backlinks** are Obsidian features on HangarWiki's roadmap but not yet implemented.

## Gitea / Forgejo

**What it is:** Gitea is a lightweight, self-hosted Git service. Forgejo is a community fork with additional features.

**What we reference:**

- **API compatibility.** HangarWiki targets the Gitea-compatible API as a baseline, with feature-gated Forgejo extensions. This means HangarWiki can work with either Gitea or Forgejo as its forge backend.
- **Repository management.** Each wiki is backed by a git repository managed through the Gitea/Forgejo API for creation, webhooks, and deploy keys.
- **SSH key registration.** Users' Ed25519 public keys are registered with the forge for git-over-SSH access.

## Ward Cunningham's Wiki

**What it is:** The original wiki, created in 1995. The WikiWikiWeb.

**What we reference:**

- **The wiki ethos.** A wiki is a collaborative space where contribution is easy and structure emerges organically. Pages are cheap to create, linking is the primary organizing mechanism, and the barrier to editing is as low as possible.
- **Recent Changes** as a core navigation pattern (on the roadmap).

## Git (as a wiki backend)

Several projects use git as a wiki storage backend. HangarWiki's approach is informed by:

- **Gollum** (GitHub's wiki engine) — stores pages as files in a git repo, uses the git log for history. HangarWiki takes a similar approach but with a richer editing UI and Forgejo integration.
- **Wiki.js** — supports git as a storage backend alongside databases. HangarWiki goes further by making git the _only_ source of truth.
- **Gitit** — a Haskell wiki backed by git. Demonstrates that git-backed wikis can be fast and reliable at small scale.

The key insight from all of these: git is an excellent wiki backend for small teams. The commit log _is_ the history. Branching and merging _are_ the collaboration model. The filesystem _is_ the content model. You don't need a database for content — only for indexing and access control.
