# ADR 002: Delegate Authorization to Forgejo
**Date:** 2026-05-26 **Status:** Accepted (open question resolved by [ADR 003](./003-power-user-direct-access.md): Option B adopted)
## Context
HangarWiki shipped with a permissions model that lives in its own database: `wiki_members (wiki_id, user_id, role, …)`, with `Owner / Editor / Viewer` roles and per-wiki membership. The original `PRODUCT.md:21` framing was "runs alongside Forgejo … but has its own auth and UI." Forgejo's role was storage, webhook source, and a power-user `git push` escape hatch.

In practice the implementation diverged from the design. `services/wiki.ts:353–369` auto-grants the `editor` role to _any_ authenticated user on first interaction with a public wiki, bypassing the "Owner invites members" flow the original design specified. This shortcut is a wrong default, not a delegation strategy.

[Issue #10](https://github.com/peterkaminski/hangarwiki/issues/10) tried to address the resulting muddle by adding finer-grained scope levels (`read / read+write / read+write+create`) on top of the broken default. Reviewing it, we realized #10 was canonizing the auto-grant bug rather than fixing the underlying problem. The right move is a structural shift, not a finer-grained version of the existing shortcut.

This ADR records that shift: HangarWiki delegates authorization to Forgejo in full. HangarWiki retains the user-facing surface (signup, magic-link auth, wiki UI, SSH-key registration UI) and transparently provisions everything needed in Forgejo behind the scenes. Non-owner users never have to touch Forgejo directly.
## Decision
### Per-user Forgejo accounts
On HangarWiki signup (magic-link verify), HangarWiki provisions a Forgejo user via the Forgejo admin API. A random unguessable password is set and never exposed to the user. HangarWiki stores either a per-user personal access token or the encrypted password so it can act as that user against Forgejo for git operations and API calls.

The user is unaware that Forgejo exists. They sign up to HangarWiki, log in to HangarWiki, and interact with the HangarWiki UI.
### SSH keys live in Forgejo
HangarWiki's SSH-key UI forwards key registration to Forgejo via the admin API, attaching the key to the user's Forgejo account. HangarWiki no longer encrypts and stores SSH keys in its own database. Forgejo's existing key management is the source of truth.
### Forgejo orgs are the unit of membership
A HangarWiki "community" / "cohort" maps to a Forgejo organization. A single HangarWiki instance can host many orgs. Wiki repositories are owned by the org, not by individual users' personal Forgejo namespaces.

Orgs are first-class HangarWiki entities. An owner creates an org through the HangarWiki UI, and HangarWiki provisions it via the Forgejo admin API (`POST /admin/orgs/:user/orgs`). The owner does not need to log in to Forgejo.
### Three canonical teams per org
Every HangarWiki-provisioned org has exactly three teams:

| Team | Forgejo permission | Meaning |
| --- | --- | --- |
| Readers | Read | Can read every repo (wiki) in the org |
| Editors | Write | Can read and edit every wiki in the org |
| Admins | Admin | Full control over every repo and the org |

All three teams are scoped to **all repos in the org**. There are no per-wiki teams. Adding a user to a team grants them that permission across every wiki in the org.

Membership in HangarWiki = membership in one of the three teams. Adding "Alice as Editor in cohort X" calls Forgejo's add-team-member API for the Editors team of org X.
### HangarWiki owns no authz logic
Every access check becomes a Forgejo query: "is this user in the relevant team for the relevant org?" HangarWiki has no internal role table and no auto-grant logic. The result is cached (see below) to keep request latency reasonable.

The current `wiki_members` table is dropped. If pre-fetched membership is needed for UI snappiness, it lives as a cache, not as state.
### Repo visibility for anonymous read
Public wikis use Forgejo's public-repo visibility. Anonymous read access goes through HangarWiki's content-serving path, which checks the repo's Forgejo visibility before serving. To avoid a Forgejo API call on every page view, repo visibility is cached:

- Invalidate on settings-change events from the HangarWiki UI
  
- Invalidate on relevant webhook events from Forgejo (if exposed)
  
- Ceiling: refresh any cache entry at least every 5 minutes
  
### What does not survive from issue #10
The "Public, edit existing but not create new pages" level from #10 has no Forgejo primitive — collaborator levels are Read / Write / Admin, and Write covers both edit-existing and create-new. We drop this level. The remaining two levels map cleanly:

- "Public, read-only" → public-visibility repo, no auto-team-add
  
- "Public, full collaboration" → public-visibility repo + auto-add to the org's Editors team on first authenticated interaction. This last bit is still a HangarWiki-side policy decision — what we're delegating is _enforcement_, not policy.
  
### Migration
No migration path is supported. Existing deployments were developer-test instances; they can be rebuilt against the new model.
## Consequences
### Good
- **Single source of truth.** "Who can read/write this wiki" lives in exactly one place: Forgejo team membership.
  
- **Identity portability.** If HangarWiki goes away, users still have their Forgejo accounts, repos, history, and SSH keys.
  
- **Power-user** `git push` **just works.** Once a user has a Forgejo account with their SSH key registered and the right team membership, they can push to wiki repos directly without HangarWiki in the loop.
  
- **Less crypto material in HangarWiki's DB.** SSH keys move out entirely. Only the per-user Forgejo credential (token or encrypted password) remains, and only one per user.
  
- **The auto-grant-editor shortcut goes away.** Membership is explicit — either you're on the team or you're not. No silent grant on first touch.
  
- **Org as the natural unit for cohorts.** PRODUCT.md's target audience ("5–50 people, small teams and learning cohorts") maps cleanly onto a Forgejo org with three teams.
  
### Trade-offs
- **No per-wiki membership.** Today, two wikis on one instance can have totally different memberships. Under this model they can't — they must live in different orgs. This is a real loss of granularity, accepted as the cost of the simpler model. The cohort-shaped use case doesn't need per-wiki granularity; instances that do can spin up additional orgs.
  
- **No "edit-existing-but-not-create" level.** Forgejo's `Write` permission covers both. Dropping the awkward middle level from #10.
  
- **HangarWiki still owns the policy** that decides who gets added to which team. Enforcement is delegated; policy is not. The framing for users and contributors should be "Forgejo is the access check" not "Forgejo decides who has access."
  
### Risks
- **Forgejo API availability.** Every access check now requires a Forgejo call (mitigated by caching). Forgejo being down or slow degrades HangarWiki. Cache TTL bounds the blast radius; on cache miss with Forgejo unavailable, we need to decide whether to fail open or closed (probably closed — fail to deny, with a clear error message).
  
- **User-creation collisions.** Two HangarWiki users with similar emails might want the same Forgejo username. HangarWiki needs a username derivation scheme that handles collisions (suffix counter, or HangarWiki-generated handle).
  
- **Forgejo admin token blast radius.** HangarWiki holds an admin token that can create any user, any org, any repo. Compromise of this token compromises every Forgejo account on the instance. Existing concern, but the surface area grows under this model. Rotation procedure needs to be documented.
  
- **Forgejo upgrades.** Forgejo API surface changes between major versions (we just bumped 10 → 15 in DEPLOYMENT.md). The integration should be tested against each Forgejo version we support, and the supported range should be explicit.
  
## Open Question
**How does a power user gain direct access to the Forgejo account HangarWiki created on their behalf?**

Two options:

- **Option A — Take-over the managed account.** HangarWiki provides a "set Forgejo password" or "export Forgejo credentials" path. The user receives a password and can log in to Forgejo directly. HangarWiki continues to act as that account via its stored token. Single identity per user.
  
- **Option B — Separate personal Forgejo account.** The HangarWiki-managed account stays a service account that HangarWiki controls. If the user wants direct Forgejo access, they create their own personal Forgejo account independently. HangarWiki's UI lets them attach that personal account to their HangarWiki identity, and HangarWiki adds the personal account to the appropriate team(s) alongside the managed account. Two identities per power user — one HangarWiki-managed (for HangarWiki to impersonate), one personal (for direct Forgejo work).
  

Pete is leaning Option B but the decision is open. The implementation detail blocks little — both options are layerable on top of the delegate-everything-else design recorded here — so this ADR can be accepted in principle, with the power-user-access mechanism deferred to a follow-up ADR.

**Resolved 2026-05-26:** [ADR 003](./003-power-user-direct-access.md) adopts Option B.
## Alternatives Considered
1. **Restore the original membership-driven design** (fix the auto-grant shortcut, leave `wiki_members` as the source of truth). Would address the immediate bug without the structural shift. Rejected because it leaves the per-user Forgejo identity story tangled and the power-user `git push` path awkward (HangarWiki has to store SSH keys, manage them per-user, sync them to Forgejo as a side effect of writing).
  
2. **Implement #10 as filed** (finer-grained public-permission levels on top of auto-grant). Rejected because it canonizes the auto-grant default as the "full collaboration" level rather than fixing the underlying mismatch with the original design.
  
3. **Single shared "wiki bot" Forgejo account.** Simpler to implement. HangarWiki uses one bot account for all git operations against Forgejo and attributes commits via the git author field. Rejected because it loses identity portability (bot account is the only Forgejo identity, users don't have their own) and breaks the power-user direct `git push` path (no per-user Forgejo account means no per-user SSH key registration).
  
4. **Per-wiki Forgejo teams** (`<wiki-slug>-readers`, `<wiki-slug>-editors`, `<wiki-slug>-admins`). Preserves per-wiki granularity inside a single org. Rejected because it produces 3 × N teams per org and doesn't match the cohort-as-org mental model; instances that need per-wiki granularity can use separate orgs.
  
5. **One Forgejo org per wiki.** Cleanest separation of memberships, but loses the cohort grouping entirely and explodes the number of orgs on a real instance. Rejected.
  
## References
- Pivot-sketch correspondence: `hangarwiki-correspondence/2026-05-26-permissions-model-pivot-sketch.md`
  
- Issue being superseded: [hangarwiki#10](https://github.com/peterkaminski/hangarwiki/issues/10)
  
- Original design references: `PRODUCT.md:21`, `PRODUCT.md:163-173`, `ARCHITECTURE.md:139`
  
- Current shortcut bug: `services/wiki.ts:353–369`
