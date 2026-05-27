# Phase 6: Cleanup — drop dead code, update docs, close #10

After Phase 5, `wiki_members` and the auto-grant code are unused but still in the codebase. The original design docs (PRODUCT.md, ARCHITECTURE.md) still describe the old model. This phase finishes the migration.

## Changes

### 1. Clean schema definition — no DB-level DROPs or ALTERs

The schema in `db/schema.ts` and the `CREATE TABLE` statements in `db/index.ts` are rewritten to their final ADR-002 shape:

- `wiki_members` table is **gone from the schema entirely** — no `CREATE TABLE`, no `wikiMembers` export.
- The `users` table is defined with its final column set: identity + forge-* columns (added by Phase 1) and nothing more. The legacy `public_key` / `encrypted_private_key` columns are not in the schema at all.

There is no `DROP TABLE wiki_members` step, no `DROP COLUMN`, no `ALTER TABLE` cleanup, no "keep dead columns with a comment." The lightweight migration scheme is bypassed for this transition: per ADR 002, upgrading from a pre-ADR-002 instance requires a **fresh database**. Operators wipe their DB and the next `initDb` run produces the final schema directly.

**Files:**
- `packages/server/src/db/schema.ts` — delete the `wikiMembers` export and the `public_key` / `encrypted_private_key` fields on `users`.
- `packages/server/src/db/index.ts` — remove the `CREATE TABLE wiki_members` block; the `addColumn` calls from Phase 1 for the new forge columns stay (they're idempotent for fresh DBs and harmless for any dev DB that did pick them up).

### 2. Remove `wiki_members` code references

Grep for `wikiMembers` and `wiki_members`. Expected remaining references:

- `createWiki` / `importWiki` inserts (legacy from Phase 3) — delete.
- `deleteWiki` (`services/wiki.ts:302–330`) `db.delete(wikiMembers).…` line — delete.
- Test files importing `wikiMembers` — remove imports + any assertions against the old table.

Anything left after this should be in docs / changelogs / this plan — fine to leave.

### 3. Remove keypair-handling code references

Phase 5 already stopped the magic-link keypair generation and the `/api/auth/export-key` route. Phase 6 finishes:

- Drop any remaining reads/writes of `users.public_key` / `users.encrypted_private_key` from `services/auth.ts`, `services/ssh.ts` (if any), and any backfill or test helpers.
- Remove unused imports of `encryptPrivateKey` / `decryptPrivateKey` if no callers remain (the `encryptSecret` / `decryptSecret` wrappers added in Phase 1 stay).

The fields are gone from the schema (per section 1); the code stops referencing them.

### 4. PRODUCT.md rewrite

The framing change is in two specific sections — rewrite both:

- **PRODUCT.md:21** (currently: "Runs alongside Forgejo. … has its own auth and UI.")
  New: "Runs alongside Forgejo. Uses Forgejo for storage, identity, and authorization. HangarWiki provides the user-facing auth (magic link), wiki UI, and editor; everything underneath delegates to Forgejo."

- **PRODUCT.md:163–173** (Wiki-Level Permissions section, Owner / Editor / Viewer + per-wiki membership)
  Rewrite to describe the new model: orgs (= cohorts/communities) with three teams (Readers / Editors / Admins), org-scoped membership, no per-wiki membership. Note explicitly that per-wiki granularity is gone and that the cohort-as-org pattern fits PRODUCT.md's "5–50 people" target.

Avoid pinning future versions or hedging about platform-agnosticism (no "for now we assume Forgejo; later we might…").

### 5. ARCHITECTURE.md rewrite

- **ARCHITECTURE.md:139** (`wiki_members` table description) — remove the table from the schema section. Add the `orgs` table.
- Add a "Authorization model" section: every access check is a Forgejo team membership lookup; visibility cache (5-min TTL); fail-closed on Forgejo unavailability.
- Update the directory listing to add `services/org.ts`, `services/forge-provisioning.ts`, `services/forge-identity.ts`, `services/visibility-cache.ts`, `routes/orgs.ts`, `pages/Org*.tsx`.

### 6. DEPLOYMENT.md

- Document required Forgejo admin token scopes (`admin:user`, `admin:org`, `write:repository` — confirm exact names).
- Document admin token rotation: how to mint a new admin token in Forgejo, swap it in HangarWiki's env, restart. Note that compromise of this token is total compromise — every user, every repo. (Do not design rotation tooling; this is a doc-only call-out.)
- Add the fresh-DB instruction explicitly: upgrading from a pre-ADR-002 instance requires a fresh database. There is no backfill or migration script.

### 7. CHANGELOG.md

One entry: "ADR 002: authorization delegated to Forgejo. `wiki_members` removed. Orgs introduced as first-class entities. No data migration from pre-2.0 instances."

### 8. Close issue #10

Per Pete (2026-05-26): close immediately with a pointer to ADR 002 and this plan, before Phase 1 starts. Closed out-of-band on 2026-05-26; this step is a no-op in Phase 6 itself but listed here for completeness.

### 9. GLOSSARY.md

Add: **Org** (= cohort / community; maps to a Forgejo organization). **Readers / Editors / Admins** (the three canonical teams in every HangarWiki-provisioned org).

Remove: any entries that defined `wiki_members` role distinctions.

### 10. WISHLIST.md

Check for items implied by old #10 ("Public, edit existing but not create"). Mark as **dropped (no Forgejo primitive)** with a one-line reason.

## Verification

1. `npm test` — full suite passes; no lingering imports of `wikiMembers`.
2. `npm run lint` clean.
3. `git grep wiki_members` returns nothing in source files (may still hit CHANGELOG / ADRs / this plan — fine).
4. `git grep wikiMembers` likewise.
5. Manual: spin up a fresh dev DB, confirm `wiki_members` is not present (`sqlite> .tables`).
6. Read-through: PRODUCT.md and ARCHITECTURE.md no longer describe a model that contradicts the running code.

## What gets ripped out

- `wiki_members` from the schema definition (no `CREATE TABLE` and no `wikiMembers` export); all reads/writes; the `'owner' | 'editor' | 'viewer'` role enum and any types that depended on it.
- `users.public_key` / `users.encrypted_private_key` from the schema definition; all remaining reads/writes.
- PRODUCT.md's "has its own auth" framing.

(No live-DB DROPs or ALTERs. Operators wipe their database; the next startup produces the final schema directly.)

## Don't ship before

Phase 4 and Phase 5 (otherwise `checkAccess` reads `wiki_members`, signup writes it, etc.).

## Env / config

No new vars. Documents (DEPLOYMENT.md) the existing `FORGE_API_TOKEN` scope requirements.
