# Phase 3: Wiki lifecycle adjusted for orgs

Wikis now live under an org. Creation requires an org. The Forgejo repo is created in the org's namespace, not in the admin user's personal namespace. Per-wiki membership UI goes away.

This phase still uses the legacy `checkAccess` (with `wiki_members`) for runtime access checks — Phase 4 swaps that out. The point of this phase is to get the lifecycle right; the authz cutover happens immediately after and is mergeable on its own.

## Changes

### 1. DB: associate wikis with orgs

**File:** `packages/server/src/db/schema.ts`

Add to `wikis`:
```ts
orgId: text('org_id').references(() => orgs.id),   // nullable for legacy rows
```

**File:** `packages/server/src/db/index.ts`
```ts
addColumn(`ALTER TABLE wikis ADD COLUMN org_id TEXT REFERENCES orgs(id)`);
```

### 2. `createWiki` / `importWiki`: require an org, create repo in org namespace

**File:** `packages/server/src/services/wiki.ts`

Change the signature:
```ts
createWiki(slug, title, ownerId, opts: { orgId: string; visibility?: 'public' | 'private' })
importWiki(url, slug, title, ownerId, opts: { orgId: string; visibility?: 'public' | 'private' })
```

In `connectWikiToForge`:
- Replace `forge.createRepo(slug, …)` (which posts to `/user/repos`) with `forge.createOrgRepo(org.forgeOrg, slug, …)` (posts to `/orgs/{org}/repos`).
- The repo's `forge_owner` in our DB becomes the org slug, not `currentUser.login`.
- Deploy key registration (`forge.addDeployKey`) is unchanged — same per-repo key path.
- Webhook registration is unchanged.

Caller (route) verifies the creator is on the Admins team of `orgId` before calling. (`checkOrgAdminAccess` helper, lives in `services/org.ts`, calls `forge.isTeamMember(org.forgeAdminsTeamId, user.forgeUsername)`.)

Still write the legacy `wiki_members(owner)` row for now — Phase 4 stops reading it, Phase 6 stops writing it. Keeping it through Phase 3 means a partial deploy doesn't break the existing `checkAccess` path.

### 3. `listWikis`: scope by org

**File:** `packages/server/src/services/wiki.ts`

Two cases:
- `listWikis(userId)` — wikis from any org the user is in. Walks user's orgs via Forgejo, then for each org reads `wikis WHERE org_id = ?`. (Don't ask Forgejo to enumerate repos per org — we already have the wiki rows.)
- New `listWikisInOrg(orgSlug)` — wikis in a specific org.

### 4. Routes

**File:** `packages/server/src/routes/wikis.ts`

- `POST /api/wikis` — body now includes `orgSlug`. 400 if missing. Look up the org; check the caller is on Admins; pass `orgId` through.
- `POST /api/wikis/import` — same change.
- `GET /api/orgs/:org/wikis` — new endpoint, calls `listWikisInOrg`.
- `PATCH /api/wikis/:wiki` — unchanged shape, but visibility change should invalidate the visibility cache (cache lands in Phase 4; Phase 3 can leave a TODO comment).
- `DELETE /api/wikis/:wiki` — unchanged.

**File:** `packages/server/src/services/wiki.ts` (`updateWiki`)

When visibility changes, also update the Forgejo repo's visibility (`PATCH /repos/{org}/{repo}` with `{ private: visibility === 'private' }`). Forgejo is now the source of truth for the public/private bit at access-check time, so the two must stay in sync.

### 5. Frontend

**File:** `packages/web/src/pages/OrgHome.tsx`

Replaces the per-org wiki listing stub from Phase 2. Lists wikis in the org with create / import buttons. The existing create-wiki and import-wiki forms move out of `WikiList.tsx` into `OrgHome.tsx`. Forms now don't need a slug-conflict check at submit — they will get a clear 409 from the server.

**File:** `packages/web/src/pages/WikiList.tsx`

Reshape to "your wikis across all orgs," grouped by org. Drop the inline create/import forms (now in `OrgHome`). Add an empty-state that points the user at `/orgs`.

**File:** `packages/web/src/pages/WikiSettings.tsx`

Remove the members section (if it has one) — managing membership is an org concern now, not a wiki concern. Keep the danger-zone "Delete Wiki" block.

## Verification

1. `npm test` passes; existing wiki tests need their signatures updated and a test org seeded in setup.
2. Integration: create org → create wiki in org → repo appears under `/{org-slug}/{wiki-slug}` in Forgejo → push works → delete wiki → repo gone.
3. Manual: try to create a wiki without selecting an org → 400.
4. Manual: change a wiki's visibility in HangarWiki → confirm Forgejo's repo visibility flipped to match.

## What gets ripped out

- `WikiList.tsx`'s inline create/import forms (moved to `OrgHome`).
- The `WikiSettings` members section, if present.
- `connectWikiToForge`'s reliance on `forge.getCurrentUser().login` as the repo owner. Owner is now the org.

Not yet ripped out: `wiki_members`, the auto-grant logic, the `role` enum. Those go in Phase 4 / Phase 6.

## Don't ship before

Phase 2.

## Env / config

None new.
