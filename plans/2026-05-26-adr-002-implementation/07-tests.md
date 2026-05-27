# Phase 7: Test strategy

What to test, where, and what to retire. Most of these tests are written incrementally inside their owning phase — this file is the consolidated map so nothing is missed.

## Test surface map

| Layer | Where | Phase that adds it |
|---|---|---|
| `ForgeClient` admin methods | `services/forge.test.ts` (unit, mocked fetch) | 1 |
| `ForgeClient` admin methods | `integration/forge.test.ts` (live Forgejo) | 1 |
| Username derivation | `services/forge-identity.test.ts` (unit) | 1 |
| `provisionForgeUserForUser` | `services/forge-provisioning.test.ts` (unit + integration) | 1 |
| `createOrg` happy path | `services/org.test.ts` (unit, mocked Forgejo) | 2 |
| `createOrg` against live Forgejo | `integration/org.test.ts` | 2 |
| Org membership add/remove/set | `services/org.test.ts` + `integration/org.test.ts` | 2 |
| Org-scoped wiki creation | `services/wiki.test.ts` (rewrite of existing) | 3 |
| `checkAccess` Forgejo-delegated | `services/wiki.access.test.ts` (new) | 4 |
| Visibility cache TTL + invalidation | `services/visibility-cache.test.ts` (unit) | 4 |
| Fail-closed on Forgejo down | `services/wiki.access.test.ts` (integration with Forgejo stopped) | 4 |
| Magic-link verify provisions Forgejo | `services/auth.test.ts` (mocked) + integration | 5 |
| SSH-key API → Forgejo | `routes/user.ssh-keys.test.ts` (mocked) + integration | 5 |
| End-to-end: signup → org → wiki → page edit → push | `e2e/wiki-flow.spec.ts` (extend) | 5/6 |

## Integration test harness

Today's `src/integration/forge.test.ts` runs only when `FORGE_API_TOKEN` is set, and cleans up its own repos in `afterAll`. Same pattern for the new integration files. Add a shared helper:

**File:** new `packages/server/src/integration/_helpers.ts`

```ts
export async function makeTestOrg(forge: ForgeClient, prefix = 'hw-test'):
  Promise<{ orgSlug: string; cleanup: () => Promise<void> }>;
```

Creates an org named `${prefix}-${Date.now()}`, returns it plus a `cleanup` that deletes the org (which cascades-deletes its teams and repos in Forgejo). Tests that fail mid-run leak orgs — acceptable for now; the existing test file already has this exposure.

For Phase 4's "Forgejo down" test, use a separate `ForgeClient` pointed at a non-routable port (`http://127.0.0.1:1`) rather than stopping the real Forgejo. That keeps the test self-contained and parallel-safe.

## What gets retired

- The current `checkAccess` tests that exercise `wiki_members` rows directly (whatever exists today) — replaced in Phase 4.
- Any test that exercised the auto-grant-on-first-touch behavior. There may be tests pinning the auto-grant behavior as desired — those become refuted-by-design and get deleted, not "skipped."
- `exportPrivateKey` / `/api/auth/export-key` tests (Phase 5).
- `addUserKey` self-acting tests (the user-token path goes away in favor of admin-side `addUserKeyAsAdmin`).

## E2E test (Playwright)

**File:** `packages/e2e/wiki-flow.spec.ts`

Extend the existing flow:
1. Sign up via magic-link (existing).
2. **New:** create an org.
3. **New:** add a second user to the org as Editor.
4. Create a wiki inside the org (existing flow, just inside an org now).
5. Edit a page, see the edit (existing).
6. **New:** sign in as the second user, confirm the wiki is visible and editable.
7. **New:** as the second user, confirm wiki settings are not accessible (Admins only).

E2E requires running Forgejo. Document the prerequisite in TESTING.md (Phase 6 doc work).

## CI

If CI runs the Forgejo integration suite (check `.github/workflows/`), make sure the runner has a Forgejo container with admin token configured. If it doesn't, the integration tests skip cleanly (existing pattern: `describe.skipIf(!shouldRun)`).

The unit-test layer (mocked Forgejo) should always run in CI and should give full coverage of the new code paths. The integration layer is the safety net for "are we using the Forgejo API correctly?" — important but slower.

## Verification

Test suite passes locally (`npm test`) and (`FORGE_URL=… FORGE_API_TOKEN=… npm test`) with the integration suite enabled.

## Don't ship before

Phase-specific tests ship inside their phases. This file is the map; there's no separate "Phase 7 PR."
