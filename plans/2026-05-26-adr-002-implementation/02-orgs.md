# Phase 2: Orgs as first-class HangarWiki entities

Introduce orgs in HangarWiki, with UI to create them and Forgejo provisioning behind the scenes. This phase does not yet rewire wikis to live under orgs — that's Phase 3 — so existing wikis (if any) keep working through the legacy `wiki_members` path until Phase 4.

## Changes

### 1. DB: `orgs` table

**File:** `packages/server/src/db/schema.ts`

```ts
export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),                 // nanoid
  slug: text('slug').notNull().unique(),       // HangarWiki-side slug, matches forge_org
  name: text('name').notNull(),                // display name
  forgeOrg: text('forge_org').notNull().unique(),
  forgeReadersTeamId: integer('forge_readers_team_id').notNull(),
  forgeEditorsTeamId: integer('forge_editors_team_id').notNull(),
  forgeAdminsTeamId: integer('forge_admins_team_id').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

**File:** `packages/server/src/db/index.ts`

Add to `initDb` (in the `CREATE TABLE IF NOT EXISTS` block):
```sql
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  forge_org TEXT NOT NULL UNIQUE,
  forge_readers_team_id INTEGER NOT NULL,
  forge_editors_team_id INTEGER NOT NULL,
  forge_admins_team_id INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
```

### 2. Org service

**File:** new `packages/server/src/services/org.ts`

```ts
export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  forgeOrg: string;
  teams: { readers: number; editors: number; admins: number };
}

/** Create a HangarWiki org and provision the underlying Forgejo org + three teams.
 *  The caller becomes the only member of the Admins team initially. */
export async function createOrg(opts: {
  slug: string;       // a–z0–9-, like wiki slug rules
  name: string;
  creatorUserId: string;
}): Promise<OrgInfo>;

export async function listOrgsForUser(userId: string): Promise<OrgInfo[]>;
  // Iterates the user's orgs via Forgejo (`GET /users/{username}/orgs`),
  // then maps Forgejo org slugs back to HangarWiki orgs.

export async function getOrg(slug: string): Promise<OrgInfo | null>;

export async function listOrgMembers(orgSlug: string):
  Promise<Array<{ userId: string; username: string; team: 'readers' | 'editors' | 'admins' }>>;
  // For each of the three teams, fetch members; merge by username; map back to
  // HangarWiki user rows via users.forge_username. Users present on Forgejo
  // teams but unknown to HangarWiki (shouldn't normally happen) are included
  // with userId = null and surfaced in the UI as "external".

export async function addOrgMember(orgSlug: string, userId: string,
  team: 'readers' | 'editors' | 'admins'): Promise<void>;
  // Resolves users.forge_username, calls forge.addTeamMember on the right team.
  // Removes the user from any other of the three teams first (membership is
  // a single bucket from HangarWiki's perspective).

export async function removeOrgMember(orgSlug: string, userId: string): Promise<void>;
  // Removes from all three teams.

export async function setOrgMemberTeam(orgSlug: string, userId: string,
  team: 'readers' | 'editors' | 'admins'): Promise<void>;
```

`createOrg` does, in order:
1. Validate slug. Reject if the HangarWiki `orgs.slug` is taken or Forgejo has an org with that name.
2. Look up the creator user; if they don't yet have a Forgejo account, call `provisionForgeUserForUser(creatorUserId)` (Phase 1).
3. `forge.createOrgAsAdmin(user.forgeUsername, { username: slug, visibility: 'public' })`.
4. `forge.createTeam(slug, { name: 'Readers', permission: 'read', includes_all_repositories: true, can_create_org_repo: false })`. Capture team id.
5. Same for 'Editors' (`write`, can_create_org_repo: false) and 'Admins' (`admin`, can_create_org_repo: true).
6. `forge.addTeamMember(adminsTeamId, user.forgeUsername)`.
7. Insert the `orgs` row.

### 3. Routes

**File:** new `packages/server/src/routes/orgs.ts`

```ts
GET    /api/orgs                         // listOrgsForUser
POST   /api/orgs                         // createOrg (body: { slug, name })
GET    /api/orgs/:org                    // getOrg
GET    /api/orgs/:org/members            // listOrgMembers (admin only)
POST   /api/orgs/:org/members            // addOrgMember (admin only, body: { userId, team })
PATCH  /api/orgs/:org/members/:userId    // setOrgMemberTeam (admin only)
DELETE /api/orgs/:org/members/:userId    // removeOrgMember (admin only)
```

"admin only" = caller is on the Admins team of the org (checked via Forgejo team membership lookup — same primitive Phase 4 generalizes). For Phase 2 only, you can write this inline in the route; Phase 4 will replace it with the general `checkOrgAdminAccess` helper.

Register in `packages/server/src/index.ts` alongside `wikiRoutes`.

### 4. Frontend API

**File:** `packages/web/src/lib/api.ts`

Add `orgs` object with `list`, `create`, `get`, `listMembers`, `addMember`, `setMemberTeam`, `removeMember`.

### 5. UI: org listing, creation, and settings

**File:** new `packages/web/src/pages/OrgList.tsx`

List of the user's orgs with a "New Org" button. Same shape as `WikiList.tsx`. Each org links to `/org/:slug`.

**File:** new `packages/web/src/pages/OrgHome.tsx`

Lists wikis in the org (Phase 3 wires this up; Phase 2 stub is fine). Link to org settings.

**File:** new `packages/web/src/pages/OrgSettings.tsx`

Members table: email, display name, team (radio: Readers/Editors/Admins), remove. "Add member by email" input — looks up the user by email and adds (errors clearly if the user doesn't have a HangarWiki account yet).

Routes added to `packages/web/src/App.tsx`:
- `/orgs` → `OrgList`
- `/org/:slug` → `OrgHome`
- `/org/:slug/settings` → `OrgSettings`

Top-nav link to `/orgs` (or fold into the wiki list page header).

### 6. Bootstrap: home page lists orgs first

`WikiList.tsx` keeps working for now but the home / dashboard page should also surface orgs. Don't gut WikiList — Phase 3 reshapes it.

## Verification

1. `npm test` passes (new `org.test.ts` for `createOrg` happy path against a mocked `ForgeClient`).
2. Integration test (`src/integration/org.test.ts`): create an org against live Forgejo → three teams exist → creator is in Admins → cleanup deletes the org.
3. Manual: sign in to dev HangarWiki, create an org "test-cohort", confirm in Forgejo UI that org + three teams exist and the creator is on Admins.
4. Manual: add a second user to Editors via the OrgSettings page; confirm in Forgejo.

## What gets ripped out

Nothing — Phase 2 is additive. `wiki_members` and the auto-grant logic still live until Phase 4 / Phase 6.

## Don't ship before

Phase 1.

## Env / config

None new.
