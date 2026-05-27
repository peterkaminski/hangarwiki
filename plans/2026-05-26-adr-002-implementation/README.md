# Plan: ADR 002 — Delegate Authorization to Forgejo

## Context

ADR 002 (`adr/002-delegate-authz-to-forgejo.md`) decided that HangarWiki will delegate authz to Forgejo: per-user Forgejo accounts, orgs as the unit of membership, three canonical teams per org (Readers / Editors / Admins), no `wiki_members` table, no auto-grant. This plan turns that decision into mergeable code work.

This plan supersedes anything implied by issue #10 (closed 2026-05-26 with a pointer to ADR 002 and this plan).

## Phases

Each phase ends in a working system. They land in order; later phases assume earlier-phase plumbing.

1. **[Forgejo client expansion](./01-forgejo-client.md)** — admin endpoints for user / org / team / membership / PAT creation; username derivation; per-user credential storage scheme.
2. **[Orgs as first-class entities](./02-orgs.md)** — DB schema for orgs, owner-driven org creation flow, three-team bootstrap, org listing + settings.
3. **[Wiki lifecycle adjusted for orgs](./03-wiki-lifecycle.md)** — wiki creation requires an org; repo created under org namespace; per-wiki membership UI dropped.
4. **[Authz refactor](./04-authz-refactor.md)** — `checkAccess` queries Forgejo team membership; visibility cache for anonymous reads; fail-closed policy on Forgejo unavailability.
5. **[Signup wiring](./05-signup-wiring.md)** — magic-link verify provisions Forgejo user + credential; SSH-key UI forwards to Forgejo; HangarWiki-side SSH key storage removed.
6. **[Cleanup](./06-cleanup.md)** — drop `wiki_members` and dead code; rewrite PRODUCT.md / ARCHITECTURE.md sections; close #10.
7. **[Test strategy](./07-tests.md)** — what unit tests, what integration tests against live Forgejo, what gets retired.

## Cross-cutting decisions (made by this plan)

- **Username derivation:** **both** local-part and domain, joined with `_`. Each side lowercased, scrubbed to `[a-z0-9-]` (dots and other separators become `-`, runs collapsed, leading/trailing `-` trimmed), truncated to 18 chars. Examples: `alice@example.com` → `alice_example-com`; `bob.smith@test.org` → `bob-smith_test-org`. On collision: append `-2`, `-3`, … up to `-99`, then a 6-char nanoid suffix. Stored on `users.forge_username` so HangarWiki doesn't re-derive. Keeping the email's intent visible in the handle helps when an admin is scanning the Forgejo user list.
- **Per-user credential storage:** **PAT**, not encrypted password. On user provisioning, HangarWiki sets a random unguessable password (never recorded), then creates a PAT via `POST /users/:username/tokens` using the admin token and stores the PAT encrypted in the `users` row. Rationale: rotatable; revocable individually; doesn't expose a password we have to keep safe. Forgejo PATs scoped to repo read/write are enough for the operations HangarWiki performs on the user's behalf.
- **Fail-closed on Forgejo unavailability:** on a cache miss with Forgejo unreachable, return 503 with a clear message ("Permission check temporarily unavailable"). Do not fall back to "allow." Cache TTL bounds the blast radius.
- **Visibility cache** lives in-process (Map keyed by `wikiId`, value `{ visibility, expiresAt }`). 5-minute TTL. Invalidated explicitly by settings-change events and by webhook handlers. No persistence — rebuilds on restart, that's fine.
- **Power-user direct access:** Option B is locked in by ADR 003. The managed Forgejo account is a permanent service identity; power users link a separate personal Forgejo account they create themselves. There is no "export managed credentials" flow. Phase 5's SSH-key UI registers keys against the managed account only; the "link personal account" affordance is a Phase-6-or-later addition tracked separately.

## Things to flag to Pete (not solved here)

See `handoff.md`. Short list:

- Admin-token rotation procedure is a doc-only item (DEPLOYMENT.md) — call it out as Phase 6 work, don't design rotation now.

## Pre-flight: Forgejo API endpoints (verified)

Verified against the codeberg.org Swagger (`Forgejo 15.0.0-127`, gitea-1.22.0) on 2026-05-26. All operations exist; shape notes inline.

| Operation | Endpoint | Used in |
|---|---|---|
| Create user (admin) | `POST /admin/users` (body: `CreateUserOption`) | Phase 1, 5 |
| Create PAT for user (admin) | `POST /users/{username}/tokens` with admin token (body: `CreateAccessTokenOption`; response `sha1` is the token, returned once) | Phase 1, 5 |
| Add SSH key to user (admin) | `POST /admin/users/{username}/keys` (body: `CreateKeyOption`) | Phase 1, 5 |
| Delete SSH key for user (admin) | `DELETE /admin/users/{username}/keys/{id}` (204 on success) | Phase 5 |
| List user's SSH keys | `GET /users/{username}/keys` (no `/admin/` prefix exists; public endpoint returns the same data) | Phase 5 |
| Create org owned by user (admin) | `POST /admin/users/{username}/orgs` (body: `CreateOrgOption`; org slug is the body's `username` field) | Phase 1, 2 |
| Create team in org | `POST /orgs/{org}/teams` (body: `CreateTeamOption` — confirmed: `includes_all_repositories` and `can_create_org_repo` are real fields; `permission` enum is `read \| write \| admin`) | Phase 1, 2 |
| Add user to team | `PUT /teams/{id}/members/{username}` | Phase 1, 2, 5 |
| Check team membership | `GET /teams/{id}/members/{username}` — **200 / 404** (returns User body on 200, not 204; body is discarded) | Phase 1, 4 |
| List user's permissions in org | `GET /users/{username}/orgs/{org}/permissions` (Forgejo-specific) | Phase 1, 4 |
| Create repo in org | `POST /orgs/{org}/repos` (body: `CreateRepoOption`) | Phase 1, 3 |
| Get repo visibility | `GET /repos/{owner}/{repo}` (read `private` boolean field; no `visibility` enum exists on Repository) | Phase 1, 4 |

PAT scope names (from `CreateAccessTokenOption.scopes` example): `read:repository`, `write:misc`, `read:user`, `read:organization`, etc. — the standard `read:CATEGORY` / `write:CATEGORY` grammar. Phase 1 provisions PATs with `['write:repository', 'read:user']`.

Org `visibility` enum: `public | limited | private`. HangarWiki uses `public` or `private`; `limited` is unused.

## Style notes

- Match the existing plan (`plans/2026-04-16-wiki-delete-import-upstream.md`): file lists, brief descriptions, verification steps, "what gets ripped out."
- Schema changes use the existing `addColumn` pattern in `db/index.ts:118–123` plus `CREATE TABLE IF NOT EXISTS` in `initDb`.
- DB column drops are not supported by the lightweight migration scheme — leave dropped columns in place and stop reading/writing them; mark them in a comment.
