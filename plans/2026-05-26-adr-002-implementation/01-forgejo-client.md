# Phase 1: Forgejo client expansion

Build out `ForgeClient` (and a thin per-user wrapper) with the admin endpoints later phases need. No behavior change visible to users. Ships on its own.

## Changes

### 1. `ForgeClient`: add admin and team/org methods

**File:** `packages/server/src/services/forge.ts`

Add to the existing class (which already has repo / deploy-key / webhook / user-key methods):

```ts
// ── Admin: user provisioning ──
async createUserAsAdmin(opts: {
  username: string;
  email: string;
  password: string;  // random, never stored after this call
  fullName?: string;
  mustChangePassword?: boolean;  // false for managed accounts
  sendNotify?: boolean;          // false
}): Promise<{ id: number; login: string; email: string }>;

async createUserToken(username: string, name: string, scopes: string[]):
  Promise<{ id: number; name: string; sha1: string }>;
  // sha1 is the token; returned exactly once. scopes per Forgejo: "write:repository", "read:user".

async addUserKeyAsAdmin(username: string, title: string, publicKey: string):
  Promise<ForgeKey>;
  // POST /admin/users/{username}/keys
async deleteUserKeyAsAdmin(username: string, keyId: number): Promise<void>;
  // DELETE /admin/users/{username}/keys/{id}
async listUserKeys(username: string): Promise<ForgeKey[]>;
  // GET /users/{username}/keys — public read, no /admin/ prefix
  // (Forgejo v15 has no GET /admin/users/{username}/keys; the public endpoint
  // returns the same data and doesn't require admin scope.)

// ── Admin: orgs ──
async createOrgAsAdmin(ownerUsername: string, opts: {
  username: string;       // org slug on Forgejo
  full_name?: string;
  visibility?: 'public' | 'private';
}): Promise<{ id: number; username: string }>;

// ── Teams ──
async createTeam(org: string, opts: {
  name: 'Readers' | 'Editors' | 'Admins';
  permission: 'read' | 'write' | 'admin';
  includes_all_repositories: true;
  can_create_org_repo: boolean;  // true for Admins, false for the others
}): Promise<{ id: number; name: string }>;

async addTeamMember(teamId: number, username: string): Promise<void>;
async removeTeamMember(teamId: number, username: string): Promise<void>;
async isTeamMember(teamId: number, username: string): Promise<boolean>;
  // GET /teams/{id}/members/{username}; 200 → true, 404 → false, other → throw.
  // (Forgejo v15 returns the User body on 200, not 204 — body is discarded.)

// ── Org repos ──
async createOrgRepo(org: string, name: string, opts: {
  description?: string;
  private?: boolean;
}): Promise<ForgeRepo>;
```

All of these use the admin token (`this.token`) already on the class. The "as admin" naming distinguishes them from the existing self-acting methods (`createRepo`, `addUserKey`, `getCurrentUser`) which assume the token's owner is the actor.

### 2. Per-user Forgejo client

**File:** `packages/server/src/services/forge.ts` (or split to `forge-user.ts` if it grows)

```ts
/** Build a ForgeClient that acts as a specific user via their stored PAT. */
export async function getUserForge(userId: string): Promise<ForgeClient>;
```

Loads `users.forge_username` + decrypts `users.forge_token` and returns a `ForgeClient(baseUrl, userToken)`. Used by Phase 3 for git operations attributed to the user, and by Phase 4 if any read needs the user's perspective.

### 3. DB: user-side Forgejo identity columns

**File:** `packages/server/src/db/schema.ts`

Add to `users`:
```ts
forgeUsername: text('forge_username'),       // null until provisioned
forgeUserId: integer('forge_user_id'),       // Forgejo's numeric id, for stability
forgeTokenEncrypted: text('forge_token_encrypted'),
forgeTokenId: integer('forge_token_id'),     // so we can revoke it later
```

**File:** `packages/server/src/db/index.ts`

Add to the `addColumn` block at line 118:
```ts
addColumn(`ALTER TABLE users ADD COLUMN forge_username TEXT`);
addColumn(`ALTER TABLE users ADD COLUMN forge_user_id INTEGER`);
addColumn(`ALTER TABLE users ADD COLUMN forge_token_encrypted TEXT`);
addColumn(`ALTER TABLE users ADD COLUMN forge_token_id INTEGER`);
```

### 4. Username derivation

**File:** new `packages/server/src/services/forge-identity.ts`

Derived from **both** local-part and domain of the email, joined with `_`. Keeps the email's intent visible in the Forgejo handle (especially helpful when admins are looking at the user list and matching humans to accounts).

```ts
export function deriveCandidateUsername(email: string): string;
  // 1. Lowercase the whole email; split on the last "@".
  // 2. Local-part: scrub to [a-z0-9-] (replace dots, underscores, plus-tags,
  //    anything else with "-"; collapse runs of "-"; trim leading/trailing "-").
  //    Truncate to 18 chars.
  // 3. Domain: scrub to [a-z0-9-] (replace dots with "-"; same run/trim rules).
  //    Truncate to 18 chars.
  // 4. Join with "_" between them.
  // 5. If either side empties out, fall back to "user" for that side.
  // Examples:
  //   alice@example.com         → "alice_example-com"
  //   bob.smith@test.org        → "bob-smith_test-org"
  //   carla+work@long-domain.co → "carla-work_long-domain-co"

export async function deriveAvailableUsername(email: string): Promise<string>;
  // Calls deriveCandidateUsername, then probes against Forgejo (HEAD/GET
  // /users/{name} — 404 = available, 200 = taken). On collision, append
  // "-2", "-3", ... up to "-99"; if all 99 variants are taken, append a
  // 6-char nanoid suffix. Returns the chosen name.
```

Forgejo username constraints (verified against v15): regex `^[a-zA-Z0-9]+([-_.][a-zA-Z0-9]+)*$`, length 1–40. The 18 + `_` + 18 + collision suffix shape stays under 40.

Stored on `users.forge_username` so HangarWiki doesn't re-derive on every call. Forgejo's uniqueness is the source of truth, but the mirror avoids extra API calls.

### 5. Crypto helpers for the PAT

**File:** `packages/server/src/services/crypto.ts`

The existing AES-256-GCM `encryptPrivateKey` / `decryptPrivateKey` helpers are fine to reuse — rename or add thin wrappers `encryptSecret(s)` / `decryptSecret(s)` that don't carry the "private key" framing in their names.

### 6. Provisioning helper

**File:** new `packages/server/src/services/forge-provisioning.ts`

```ts
/** Provision a Forgejo account for a HangarWiki user. Idempotent: if the
 *  user row already has forge_username + forge_token_encrypted, return early. */
export async function provisionForgeUserForUser(userId: string): Promise<void>;
```

Steps:
1. Read user row. If `forge_username` already set, return.
2. `deriveAvailableUsername(user.email)`.
3. Generate a 32-byte random password (`crypto.randomBytes(32).toString('base64url')`). Not stored.
4. `forge.createUserAsAdmin({ username, email: user.email, password, mustChangePassword: false, sendNotify: false })`.
5. `forge.createUserToken(username, 'hangarwiki-managed', ['write:repository', 'read:user'])`. (Confirm exact scope names against Forgejo v15.)
6. Encrypt the returned `sha1` token; write `forge_username`, `forge_user_id`, `forge_token_encrypted`, `forge_token_id` to `users`.

## Verification

1. `npm test` passes (Phase 1 ships only new methods + new columns).
2. Run the existing Forgejo integration test setup with new `it()` cases covering:
   - createUserAsAdmin → fetch the user back → success
   - createUserToken → use the token to do a `getCurrentUser` against Forgejo → returns the created username
   - addUserKeyAsAdmin → listUserKeysAsAdmin shows it
   - createOrgAsAdmin → createTeam(Readers/Editors/Admins) → addTeamMember → isTeamMember returns true; removeTeamMember → isTeamMember returns false
   - createOrgRepo with the user as owner → repo exists
3. Manual: provision a test user via `provisionForgeUserForUser` from a one-off script under `packages/server/scripts/`; verify the user appears in Forgejo's admin UI and the stored PAT works.

## What gets ripped out

Nothing yet. Phase 1 is purely additive.

## Don't ship before

- The Forgejo integration test suite (Phase 7) can already cover Phase 1's new methods — add those cases as part of this phase rather than waiting.

Forgejo v15 API endpoint surface was verified against the codeberg.org Swagger (`15.0.0-127`, gitea-1.22.0) on 2026-05-26. See README.md "Pre-flight" for the verified endpoint table.

## Env / config

No new env vars in Phase 1. The existing `FORGE_URL` and `FORGE_API_TOKEN` are what `ForgeClient` already uses; the admin token needs to be a Forgejo admin token (it already needs admin scope to create repos and webhooks).

DEPLOYMENT.md doc-update: explicitly note the admin token must have `admin:user`, `admin:org`, and `write:repository` scopes. (Phase 6 docs work.)
