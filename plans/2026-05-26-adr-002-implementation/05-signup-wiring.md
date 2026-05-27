# Phase 5: Signup + SSH-key wiring through Forgejo

Magic-link verify now provisions a Forgejo account before the HangarWiki user is considered fully created. The SSH-key UI forwards to Forgejo via admin API. HangarWiki stops storing user-side SSH keys.

This phase is mergeable on its own once Phase 1 lands; in practice it lands after Phase 4 so the integration tests don't have to juggle two states.

## Changes

### 1. Magic-link verify: provision before session

**File:** `packages/server/src/services/auth.ts`

In `verifyMagicLink` (right after "Find or create user", around line 121–143):

After creating (or finding) the user row, call:
```ts
await provisionForgeUserForUser(user.id);
```
If provisioning fails, **fail the verify** (return an error to the user) — don't silently produce a HangarWiki account without a backing Forgejo account, because Phase 4 will then deny every access check for them. Send the error as a 500 with a "Please try again or contact the admin" message; log the underlying Forgejo error.

(Optional refinement: if provisioning fails mid-flight after the user row was inserted, set a `users.provisioning_failed_at` column and retry on next login. Don't add that until you actually see flakiness in practice.)

### 2. SSH-key UI: register against Forgejo

**File:** `packages/web/src/pages/UserSettings.tsx`

Replace the existing "Export Private Key / show public key" block with:

- **Public keys list** (multi-key; today HangarWiki effectively only manages one server-derived key). Title + fingerprint + Remove button.
- **Add key form**: textarea for the OpenSSH public key + title input + "Add" button.

The semantics change: HangarWiki no longer mints a keypair for the user. The user supplies a public key they already have, and HangarWiki registers it against their managed Forgejo account.

Drop the "Export Private Key" button. The keypair-generation flow was always a usability shortcut for a model where HangarWiki acted as the key authority; under ADR 002 it's confusing — users either have an SSH key already, or they don't need one (web-only users).

### 3. SSH-key API

**File:** `packages/server/src/routes/user.ts` (or wherever user settings routes live)

```ts
GET    /api/user/ssh-keys              // forge.listUserKeys(user.forgeUsername)
POST   /api/user/ssh-keys              // body: { title, publicKey }
                                       // forge.addUserKeyAsAdmin(...)
DELETE /api/user/ssh-keys/:keyId       // forge.deleteUserKeyAsAdmin(...)
```

All three look up `users.forge_username` via the authenticated user and use the admin token.

`packages/web/src/lib/api.ts` gains a `sshKeys` object.

### 4. Drop HangarWiki-side keypair generation (gated)

**File:** `packages/server/src/services/auth.ts`

The current `verifyMagicLink` (~line 126–143) generates an Ed25519 keypair and encrypts the private key. **Stop doing this.** New users get no keypair from HangarWiki.

The `users` rows keep their `public_key` and `encrypted_private_key` columns for now (existing users still have these), but new rows leave them NULL. Phase 6 considers dropping them (sqlite can't drop columns easily; stop reading/writing them and add a comment).

Remove the `/api/auth/export-key` endpoint. Remove the `auth.exportKey()` function from the frontend client.

### 5. Remove `services/ssh.ts` user-key handling (if any)

`services/ssh.ts` as it stands (the file I read) only manages the **server's** SSH key, not user keys. So nothing to remove there — the server still needs its key as a deploy key on each repo. Keep `ensureServerKey`, `getServerPublicKey`, `gitSshCommand` as-is.

But: confirm by grepping for `addUserKey` / `listUserKeys` / `exportPrivateKey` and remove any callers in `routes/`.

## Power-user direct access — Option B (per ADR 003)

ADR 003 locks in Option B: the HangarWiki-managed Forgejo account is a permanent service identity. Power users who want direct Forgejo access create a personal Forgejo account independently and link it to their HangarWiki identity; HangarWiki adds the personal account to the same team(s) as the managed account.

Phase 5 builds toward this:

- SSH keys registered through HangarWiki's UI attach to the **managed** account. They are HangarWiki's keys for impersonating the user against Forgejo for git operations the user initiates from the HangarWiki UI.
- The "link personal Forgejo account" affordance is **not** built in Phase 5 — it's a Phase-6-or-later piece, tracked separately.
- HangarWiki does not at any point expose the managed account's password. There is no "export managed credentials" flow (ruling out Option A explicitly).

See `adr/003-power-user-direct-access.md` for the full decision and reasoning.

## Verification

1. `npm test` passes; magic-link tests get a mocked `provisionForgeUserForUser`.
2. Integration: sign up a new user via magic-link end-to-end against a live Forgejo → confirm Forgejo user exists with the derived username and a PAT.
3. Manual: register an SSH key in HangarWiki UI → confirm it shows up on the user's managed Forgejo account → use the key to clone a wiki repo via SSH → push a commit → it lands.

Existing dev/test DBs are not migrated: per ADR 002, fresh-DB-required is the operator instruction. There is no backfill script.

## What gets ripped out

- HangarWiki-side keypair generation in `verifyMagicLink`.
- `exportPrivateKey` (`services/auth.ts:231`) and its route.
- The "Export Private Key" UI in `UserSettings.tsx`.
- Any user-key endpoints that hit HangarWiki's own DB.

## Don't ship before

Phase 1 (the provisioning helper). Practically: ship after Phase 4 so `checkAccess` is already Forgejo-driven by the time signup depends on it.

## Env / config

None new.
