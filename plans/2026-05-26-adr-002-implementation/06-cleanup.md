# Phase 6: Cleanup — drop dead code, update docs, close #10

After Phase 5, `wiki_members` and the auto-grant code are unused but still in the codebase. The original design docs (PRODUCT.md, ARCHITECTURE.md) still describe the old model. This phase finishes the migration.

## Changes

### 1. Stop writing `wiki_members`

Grep for `wikiMembers` and `wiki_members`. Expected remaining writes (legacy from Phase 3): in `createWiki` / `importWiki`. Delete the inserts. The `wiki_members` references in `deleteWiki` (FK-safe cascade) stay until the table is dropped — they're a no-op if the table is empty.

### 2. Drop `wiki_members` table

**File:** `packages/server/src/db/index.ts`

The lightweight migration scheme doesn't support drops via `ALTER TABLE` (sqlite limitation: yes you can `DROP TABLE`, but it's destructive and irreversible in dev). Decision: just `DROP TABLE IF EXISTS wiki_members` in `initDb`, **after** the `CREATE TABLE` block (so a fresh DB stops having the table at all):

```sql
DROP TABLE IF EXISTS wiki_members;
```

**File:** `packages/server/src/db/schema.ts`

Delete the `wikiMembers` export.

Update `deleteWiki` (`services/wiki.ts:302–330`) — remove the `db.delete(wikiMembers).…` line.

Search-and-remove `wikiMembers` imports across `services/wiki.ts` and any test files.

### 3. Drop user-side keypair columns

**Decision:** keep the columns. SQLite can `DROP COLUMN` since 3.35 (2021) and Node's bundled sqlite supports it, but the lightweight migration scheme doesn't track "this column was dropped." Adding a one-shot `ALTER TABLE users DROP COLUMN encrypted_private_key` to `initDb` is technically fine but irreversible.

Lower-risk path: stop reading and writing `encrypted_private_key` (already done in Phase 5), and leave a `// dropped from use in ADR 002; column kept for now` comment on the `encryptedPrivateKey` field in `schema.ts`. Revisit when migrations are proper.

Same call for `publicKey` — it's keypair material no longer maintained by HangarWiki.

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

- `wiki_members` table (DROP), `wikiMembers` schema export, all reads/writes.
- The `'owner' | 'editor' | 'viewer'` role enum and any types that depended on it.
- PRODUCT.md's "has its own auth" framing.

## Don't ship before

Phase 4 and Phase 5 (otherwise `checkAccess` reads `wiki_members`, signup writes it, etc.).

## Env / config

No new vars. Documents (DEPLOYMENT.md) the existing `FORGE_API_TOKEN` scope requirements.
