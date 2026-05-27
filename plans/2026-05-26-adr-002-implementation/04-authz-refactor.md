# Phase 4: Authz refactor — Forgejo as the source of truth

`checkAccess` stops reading `wiki_members` and starts asking Forgejo. The auto-grant code path goes away. Visibility lookup is cached.

This is the load-bearing phase. It changes runtime behavior. Land it on its own merge so it can be reverted cleanly if Forgejo integration regresses.

## Changes

### 1. New visibility cache

**File:** new `packages/server/src/services/visibility-cache.ts`

```ts
interface CacheEntry { isPublic: boolean; expiresAt: number; }

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function getWikiVisibility(wikiId: string): Promise<boolean>;
  // In-process. On miss: look up wiki → ask Forgejo (`GET /repos/{org}/{repo}`)
  // → cache.

export function invalidateWikiVisibility(wikiId: string): void;
  // Called on PATCH /api/wikis/:wiki (visibility change) and on webhook events.

export function clearVisibilityCache(): void;
  // Test helper.
```

On Forgejo failure during a miss: throw a sentinel `ForgeUnavailableError` (don't return a stale value beyond TTL). Callers translate it to a 503.

### 2. Rewrite `checkAccess`

**File:** `packages/server/src/services/wiki.ts`

Replace the existing `checkAccess` (lines 332–374) with:

```ts
export async function checkAccess(
  wikiSlug: string,
  userId: string | undefined,
  requiredRole: 'viewer' | 'editor' | 'owner',
): Promise<boolean> {
  const wiki = await getWiki(wikiSlug);
  if (!wiki?.orgId) return false;   // un-orged wikis can't be reached
  const org = await getOrgById(wiki.orgId);
  if (!org) return false;

  // Public-repo anonymous read goes through the visibility cache.
  if (requiredRole === 'viewer') {
    const isPublic = await getWikiVisibility(wiki.id);
    if (isPublic) return true;
  }
  if (!userId) return false;

  const user = await getUser(userId);
  if (!user?.forgeUsername) return false;

  // Map requiredRole → team(s) that satisfy it.
  const teamsToCheck: number[] =
    requiredRole === 'owner'  ? [org.teams.admins] :
    requiredRole === 'editor' ? [org.teams.admins, org.teams.editors] :
                                [org.teams.admins, org.teams.editors, org.teams.readers];

  for (const teamId of teamsToCheck) {
    if (await forge.isTeamMember(teamId, user.forgeUsername)) return true;
  }
  return false;
}
```

Notes:
- The legacy `'owner'` role maps to "on the Admins team" — i.e. wiki settings + delete are gated on org-admin, not per-wiki-owner. That's the deliberate trade-off ADR 002 makes.
- The `viewer` path takes the cache fast path for public; team lookup is only on the authenticated edit/admin paths, which already do other I/O.
- The Forgejo `isTeamMember` call is a hot path on every page request from an authenticated user. If profiling shows it's a problem after Phase 4 ships, add a 60-second per-(team, user) cache in `forge.isTeamMember`. Don't pre-optimize.

### 3. Fail-closed error translation

**File:** `packages/server/src/middleware/error-handling.ts` (or wherever the global error filter lives)

Catch `ForgeUnavailableError` and translate to `503 { error: 'Permission check temporarily unavailable. Please try again.' }`.

Routes that call `checkAccess` should let this bubble; don't catch and swallow.

### 4. Webhook → cache invalidation

**File:** `packages/server/src/routes/webhooks.ts`

If Forgejo sends `repository` or `repository.visibility` events (verify the event name in Forgejo v15), parse the payload and call `invalidateWikiVisibility(wikiId)`. If the event doesn't exist in v15, lean on the explicit PATCH-driven invalidation only — the 5-minute TTL covers external changes.

### 5. Visibility change → cache invalidation

**File:** `packages/server/src/services/wiki.ts` (`updateWiki`)

After flipping Forgejo visibility (Phase 3), call `invalidateWikiVisibility(wiki.id)`.

### 6. Stop writing the wiki-owner membership row

`createWiki` and `importWiki` keep working but no longer insert into `wiki_members`. The owner has implicit Admins-team membership in the org; that's the only thing that matters now.

(Existing rows are harmless — they're just no longer read. Phase 6 drops the table.)

### 7. Drop the auto-grant code

Delete the `if (!membership) { … insert wiki_members … }` block (the old `services/wiki.ts:353–369`). It's already unreachable after the `checkAccess` rewrite, but remove the code for clarity.

## Verification

1. `npm test` passes. Existing access-check tests get rewritten to mock `forge.isTeamMember`.
2. New integration test (`services/wiki.access.test.ts`):
   - Non-member can't view a private wiki (403)
   - Non-member can view a public wiki (200, cache hit on second call)
   - Reader can view but not edit
   - Editor can edit but not change settings
   - Admin can change settings
   - Forgejo down → 503, not 200 and not 403
3. Manual: drop a Forgejo container; hit a private wiki page; confirm 503 with the right message. Bring Forgejo back; first request after cache expiry succeeds.
4. Manual: change visibility public → private in the UI; refresh; previous anonymous viewers get 404 (or 403, whichever the route returns for private wikis to anonymous).

## What gets ripped out

- `services/wiki.ts:353–369` auto-grant block.
- The `roleHierarchy` constant.
- Reads from `wiki_members` in `checkAccess` (writes from `createWiki` etc. removed too).
- `listWikis` no longer joins on `wiki_members` — it joins on `orgs` membership (queried via Forgejo + cached in-process).

## Don't ship before

Phase 3 (wikis must have an `orgId`).

If there are any deployed instances at this point, they're dev/test only per ADR — but practitioner check before merging: confirm no instance has wikis without `org_id`, or back-fill them in a one-off migration script before this phase merges.

## Env / config

No new env vars. Cache TTL is hard-coded; if it turns out to want tuning, expose via `VISIBILITY_CACHE_TTL_SECONDS` later — don't add the knob preemptively.
