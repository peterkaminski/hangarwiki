# Testing

## Running tests

```bash
# Run all tests
npm test

# Run tests with verbose output
npx vitest run --reporter=verbose

# Run tests in watch mode (re-runs on file changes)
npx vitest

# Run a specific test file
npx vitest run packages/server/src/services/git.test.ts

# Run tests matching a pattern
npx vitest run -t "wikilink"
```

## Test structure

Tests live alongside the source files they test:

```
packages/
├── server/src/services/
│   ├── git.ts              # GitService (git CLI wrapper)
│   ├── git.test.ts         # 8 tests — init, read, write, commit, log, delete
│   ├── paths.ts            # URL scrubbing and wikilink resolution
│   ├── paths.test.ts       # 13 tests — scrubPath, filePathToUrl, resolveWikilink
│   ├── crypto.ts           # Keypair generation, encryption, token hashing
│   ├── crypto.test.ts      # 8 tests — keygen, encrypt/decrypt, PEM-to-SSH
│   ├── auth.ts             # Magic link flow, sessions
│   ├── auth.test.ts        # 6 tests — magic links, sessions, key export
│   ├── wiki.ts             # Wiki + page management
│   └── wiki.test.ts        # 13 tests — CRUD, access control, URL resolution
└── shared/src/markdown/
    ├── wikilink.ts          # Wikilink parser/extractor
    ├── wikilink.test.ts     # 13 tests — extraction, embeds, images
    ├── render.ts            # Markdown-to-HTML renderer
    └── render.test.ts       # 10 tests — rendering, sanitization, wikilinks
```

**71 tests total** across 7 test files.

## What's tested

### Git Service (`git.test.ts`)
Tests against real temporary git repos (created in `$TMPDIR`, cleaned up after each test). Covers init, write, add, commit, list files, read files, log, delete, branch detection, and change detection.

### Path handling (`paths.test.ts`)
MarkPub-compatible path scrubbing, wikilink resolution with folder support, case-insensitive matching, closest-folder-first disambiguation.

### Crypto (`crypto.test.ts`)
Ed25519 keypair generation, PEM-to-OpenSSH conversion, AES-256-GCM encrypt/decrypt round-trip, token hashing and generation.

### Auth (`auth.test.ts`)
Full magic link flow (create, verify, reject expired, reject reused), session creation and validation, session invalidation (logout), private key export.

### Wiki service (`wiki.test.ts`)
Wiki creation with initial files, membership and access control (public/private, owner/editor/viewer), page CRUD in flat and nested folders, page history, URL path resolution.

### Markdown rendering (`render.test.ts`)
Basic Markdown, frontmatter extraction, `[[wikilink]]` transformation, `[[target|display]]` aliased links, `![[image.png]]` embeds, `![[page]]` transclusion placeholders, link resolution with CSS classes, XSS sanitization.

## What's NOT tested (see DEBT.md)

- Git push/pull with a real remote (only local repos tested)
- Forge API client against a live Forgejo or Gitea instance
- Conflict detection and merge scenarios
- Postmark and Resend email providers (only console provider exercised)
- HTTP route handlers (no API integration tests yet)
- Frontend components (no React tests yet)
- PEM-to-OpenSSH across different Node.js versions
- Rate limiting and CSRF (not implemented yet)

## Test environment

Tests create isolated temporary directories for SQLite databases and git repos. Environment variables (`DATA_DIR`, `ENCRYPTION_KEY`, `EMAIL_PROVIDER`) are set per-test to avoid polluting the development environment.

The `config` module uses getters that read `process.env` on each access, so tests can override config values by setting environment variables in `beforeEach`.

The `resetDb()` function clears the database singleton between tests.
