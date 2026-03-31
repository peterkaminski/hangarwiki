# Glossary

Terms used in HangarWiki's codebase and documentation.

## Incipient link

A wikilink that points to a page that does not yet exist. Also called a "ghost link" or "red link" (after the MediaWiki convention). Incipient links signal that someone has referenced a concept worth its own page, but the page hasn't been written yet. They serve as organic to-do markers for a wiki's growth.

HangarWiki supports two rendering modes for incipient links, configurable per wiki:

- **Highlight** — The link is underlined and subtly highlighted, with a tooltip explaining the page doesn't exist yet. Inspired by MarkPub's approach where tooltip text is part of the theme.
- **Create** (default) — The link appears with a lighter, dashed style and can be clicked to create the page with the link text as its title.

## Wikilink

A link written in double-bracket syntax: `[[Page Name]]` or `[[Page Name|display text]]`. Wikilinks are resolved case-insensitively across all folders in the wiki.

## Embed

A transclusion written with an exclamation prefix: `![[Page Name]]`. The referenced page's content is included inline. Image files (`![[photo.png]]`) render as images instead.

## Scrubbing

The process of converting page titles to URL-safe paths. Spaces and special characters (`? # % "`) become underscores, consecutive underscores collapse to one. Based on the MarkPub convention.

## Forge

The Gitea-compatible API server (typically Forgejo) that hosts the git repositories backing each wiki.

## Magic link

A passwordless authentication mechanism. Users receive an email with a single-use, time-limited URL. Clicking it creates a session and, for new users, generates an Ed25519 keypair.
