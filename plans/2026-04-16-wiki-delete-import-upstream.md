# Plan: Wiki Delete + Import→Forge Connection + Upstream Tracking

## Context

GitHub issue #4: imported wikis can't be deleted, and their `.git/config` still points at the original remote instead of local Forgejo. Generalizing: (1) there's no wiki delete at all, (2) import doesn't connect to Forge, and (3) we should track the upstream relationship for future sync.

## Changes

### 1. DB: Add `sourceUrl`, `sourceForkedAt`, `sourceForkCommit` columns to `wikis`

**File:** `packages/server/src/db/schema.ts`

Add three nullable columns:
- `sourceUrl` (text, nullable) — original git URL we cloned from
- `sourceForkedAt` (text, nullable) — ISO timestamp of when we imported
- `sourceForkCommit` (text, nullable) — commit hash HEAD pointed at when we forked

Since there are no migrations, also add `ALTER TABLE` fallbacks in `packages/server/src/db/index.ts` (same pattern as existing try-catch blocks there).

### 2. GitService: Add `renameRemote` and `getHead` methods

**File:** `packages/server/src/services/git.ts`

- `renameRemote(oldName: string, newName: string)` — `git remote rename`
- `getHead()` — `git rev-parse HEAD`, returns commit hash string

### 3. Import: Connect to Forge + set up upstream tracking

**File:** `packages/server/src/services/wiki.ts` — `importWiki()`

After cloning:
1. Capture HEAD commit via `git.getHead()`
2. Rename `origin` → `upstream` via `git.renameRemote('origin', 'upstream')`
3. Call `connectWikiToForge(slug, title, isPrivate)` — this adds `origin` pointing at local Forgejo, pushes, sets up webhook
4. Store `sourceUrl`, `sourceForkedAt` (now), `sourceForkCommit` (captured HEAD) in the DB record

### 4. Wiki delete: Full stack

#### Service — `packages/server/src/services/wiki.ts`

New `deleteWiki(slug: string)` function:
1. Look up wiki record (need `forgeOwner`, `forgeRepo` from raw DB, not `getWiki()`)
2. Delete DB rows: `page_links`, `page_index`, FTS entries, `wiki_members`, then `wikis` (FK order)
3. Delete Forgejo repo if `forgeOwner`/`forgeRepo` are set (via `ForgeClient.deleteRepo`)
4. Delete local repo directory (`rm -rf {dataDir}/repos/{slug}`)
5. Wrap Forge deletion in try-catch — don't fail the whole delete if Forge is unreachable

#### Route — `packages/server/src/routes/wikis.ts`

New `DELETE /api/wikis/:wiki` endpoint:
- `requireAuth` + owner-only check (same pattern as PATCH)
- Calls `deleteWiki(slug)`
- Returns `{ ok: true }`

#### Frontend API — `packages/web/src/lib/api.ts`

Add `wikis.delete(slug)` method.

#### UI — `packages/web/src/pages/WikiSettings.tsx`

Add a "Delete Wiki" danger zone at the bottom of settings:
- Red button, confirmation prompt (type wiki slug to confirm)
- On success, navigate to wiki list

### 5. Expose `sourceUrl` in wiki info

**File:** `packages/server/src/services/wiki.ts`

Update `WikiInfo` type and `getWiki()` to include `sourceUrl` (so the UI can eventually show "forked from" info). Don't build UI for it now.

### 6. Update docs

In the same commit:
- `PROJECT-PLAN.md` — no specific checkbox for delete, but it's implied by wiki lifecycle
- `WISHLIST.md` — check if wiki delete or import improvements are mentioned
- `DEBT.md` — remove the "No integration tests against live Forgejo" item if we're not addressing it, but note import now connects to Forge

## Files to modify

1. `packages/server/src/db/schema.ts` — add 3 columns
2. `packages/server/src/db/index.ts` — ALTER TABLE fallbacks
3. `packages/server/src/services/git.ts` — `renameRemote`, `getHead`
4. `packages/server/src/services/wiki.ts` — `importWiki` rewrite, new `deleteWiki`, update `WikiInfo`/`getWiki`
5. `packages/server/src/routes/wikis.ts` — DELETE endpoint
6. `packages/web/src/lib/api.ts` — `wikis.delete()`
7. `packages/web/src/pages/WikiSettings.tsx` — delete UI

## Verification

1. `npm test` — existing tests pass
2. Manual: create a wiki, verify it works, delete it via settings, verify DB and disk cleanup
3. Manual: import a wiki from a public GitHub URL, verify:
   - `git remote -v` in the repo dir shows `origin` → local Forgejo, `upstream` → source URL
   - DB has `sourceUrl`, `sourceForkedAt`, `sourceForkCommit` populated
   - Wiki can be deleted after import
