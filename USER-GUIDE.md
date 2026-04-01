# HangarWiki User Guide

## What is HangarWiki?

HangarWiki is a wiki engine that stores all your content as Markdown files in git repositories. You edit pages in a web browser, and behind the scenes every edit becomes a git commit — giving you full version history, diffs, and the ability to work with your content using any git-compatible tool (Obsidian, VS Code, etc.).

## The Big Picture: Instances and Wikis

HangarWiki has a two-level structure that's different from most wiki engines:

```
┌─────────────────────────────────────────────┐
│  HangarWiki Instance                        │
│  (e.g., wiki.collectivesensecommons.org)    │
│                                             │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ Wiki A      │  │ Wiki B      │  ...      │
│  │ "Handbook"  │  │ "Projects"  │           │
│  │  - Page 1   │  │  - Page 1   │           │
│  │  - Page 2   │  │  - Page 2   │           │
│  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────┘
```

**An instance** is a running copy of HangarWiki on a server. A community or organization runs one instance. The instance has a URL (like `wiki.example.org`) and handles user accounts and authentication.

**A wiki** is a collection of linked Markdown pages. Each wiki is independent — it has its own pages, its own settings, and its own git repository. One instance can host many wikis.

Think of it like email: Gmail is the service (the instance), and each user has multiple folders or labels (the wikis). Or like GitHub: github.com is the instance, and each repository is a self-contained project.

### Why multiple wikis?

Different wikis serve different purposes. A community might have:

- A **handbook** wiki for policies and procedures
- A **projects** wiki for active project documentation
- A **meeting notes** wiki for weekly calls
- A **knowledge garden** wiki for shared reference material

Each wiki has its own page list, its own search, and its own settings. Pages within a wiki link to each other using `[[wikilinks]]`.

### Multiple instances

Different communities run their own instances. Each instance is completely independent — separate server, separate user accounts, separate data.

| Instance | Who runs it | What it hosts |
|---|---|---|
| `wiki.example.org` | Acme Corp | Internal company wikis |
| `wiki.gardenclub.org` | Garden Club | Plant database, meeting notes |
| `localhost:4000` | You, on your laptop | Personal wikis for testing |

The HangarWiki software is the same in each case. The instance is what makes it "Acme Corp's wiki" vs. "Garden Club's wiki."

## Getting Started

### Signing in

HangarWiki uses **magic links** instead of passwords. Enter your email address, check your inbox, and click the link. That's it — you're signed in.

Your session persists across browser tabs and stays active until you sign out or the session expires.

### The wiki list

After signing in, you see **Your Wikis** — a list of all wikis on this instance. From here you can:

- Click a wiki to open it
- Click **New Wiki** to create one
- Click **Import** to create a wiki from an existing git repository

### Creating a wiki

Click **New Wiki** and fill in:

- **Title**: The display name (e.g., "Project Handbook")
- **Slug**: The URL-friendly identifier (e.g., `project-handbook`). Auto-generated from the title, but you can customize it.

The slug becomes part of every URL in that wiki: `wiki.example.org/project-handbook/My_Page`.

### Importing a wiki

If you have an existing collection of Markdown files in a git repository (like an Obsidian vault on GitHub), click **Import** and paste the repository URL. HangarWiki will clone it and index all the Markdown files as wiki pages.

Currently supports public repositories only. The slug and title are auto-derived from the repository URL.

## Working with Pages

### Creating a page

From any wiki's home page, click **New Page**. Fill in the title, write your content in the editor, and click **Save**.

The page title becomes the filename: a page titled "Meeting Notes" is stored as `Meeting Notes.md` in the git repository.

### Editing a page

Click **Edit** on any page to open the editor. The editor uses CodeMirror with Markdown syntax highlighting.

**Keyboard shortcuts in the editor:**
- **Cmd+S** (Mac) / **Ctrl+S** (Windows/Linux): Save the page
- **Escape**: Cancel editing and return to the page

### Wikilinks

Link to other pages using double brackets:

```markdown
Check the [[Project Handbook]] for details.
See also [[Meeting Notes|our latest notes]].
```

- `[[Page Name]]` links to the page with that title
- `[[Page Name|display text]]` links to the page but shows different text

As you type `[[`, the editor suggests existing pages for autocomplete.

**Incipient links** are wikilinks that point to pages that don't exist yet. They appear visually distinct (styled differently from links to existing pages). Depending on the wiki's settings, clicking an incipient link either navigates to a pre-filled "new page" form or highlights the link for you to create the page later.

### Backlinks

At the bottom of each page, you'll see **Pages that link here** — a list of other pages in the wiki that contain wikilinks pointing to this page. This is one of the most useful navigation features in a wiki: it shows you the context and connections around any page without having to manually maintain an index.

### Page history

Click **History** on any page to see every edit as a list of git commits. Click any commit to expand an inline diff showing exactly what changed — additions in green, deletions in red.

### Search

The search bar on each wiki's home page does full-text search across all page content. Results appear as you type (with a short debounce) and show highlighted snippets of matching text.

## Wiki Settings

Click **Settings** on a wiki's home page (visible when signed in) to configure:

- **Title**: Change the wiki's display name
- **Visibility**: Public (anyone can read) or Private (members only)
- **Incipient link style**: How links to nonexistent pages behave — "create" (clicking goes to a new-page form) or "highlight" (just visually marks the link)

## Account Settings

Click your name in the top navigation bar to access your account settings:

- **Display name**: How your name appears on edits and in the navigation. If not set, your email address is shown.
- **SSH key export**: Your private key for git access. You can reveal and copy it to configure SSH-based `git clone` and `git push` with your wiki repositories.

## Editing via Git (Power Users)

Every wiki is backed by a git repository. If you prefer editing Markdown in Obsidian, VS Code, or any other tool, you can:

1. Export your SSH private key from Account Settings
2. Configure your SSH client to use that key
3. Clone the wiki's repository
4. Edit files locally and push

Your commits will be attributed to your HangarWiki identity. Changes pushed via git are reflected in the web UI.

Page files use spaces in filenames (e.g., `My Cool Page.md`), matching Obsidian conventions. Wikilinks (`[[Page Name]]`) work the same way in both the web UI and Obsidian.

## URL Structure

HangarWiki URLs use underscores where page names have spaces:

| Page file | URL |
|---|---|
| `My Cool Page.md` | `/wiki-slug/My_Cool_Page` |
| `Projects/Design Doc.md` | `/wiki-slug/Projects/Design_Doc` |

URLs are case-insensitive: `/wiki-slug/my_cool_page` and `/wiki-slug/My_Cool_Page` both work.

## Concepts Reference

| Term | What it means |
|---|---|
| **Instance** | A running copy of HangarWiki on a server. One per community/organization. |
| **Wiki** | A collection of linked Markdown pages with its own settings and git repo. |
| **Page** | A single Markdown file within a wiki. |
| **Slug** | The URL-friendly identifier for a wiki (e.g., `project-handbook`). |
| **Wikilink** | A `[[Page Name]]` link connecting pages within a wiki. |
| **Incipient link** | A wikilink to a page that doesn't exist yet. |
| **Backlink** | A page that links *to* the current page. |
| **Magic link** | A one-time sign-in link sent to your email (no password needed). |
