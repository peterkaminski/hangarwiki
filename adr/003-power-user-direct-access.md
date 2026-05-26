# ADR 003: Power-user direct access to Forgejo

**Date:** 2026-05-26 **Status:** Accepted

## Context

ADR 002 left one open question: how a power user gains direct access to the Forgejo account HangarWiki provisions on their behalf. Two options were on the table:

- **Option A — Take-over the managed account.** HangarWiki provides a path for the user to receive the managed account's password and log in to Forgejo directly. One identity per user.
- **Option B — Separate personal account.** The HangarWiki-managed account stays a service identity. The user creates a personal Forgejo account independently; HangarWiki gains a "link my personal Forgejo account" affordance that adds the personal account to the same team(s) as the managed account. Two identities per power user.

ADR 002 was accepted with this question deferred. This ADR closes it.

## Decision

**Option B is adopted.** The HangarWiki-managed Forgejo account is a permanent service identity. It exists for HangarWiki to impersonate the user against Forgejo for git operations and API calls initiated from the HangarWiki UI. Its credentials are never exposed to the user.

Power users who want direct `git push` access, who want to use Forgejo's web UI, or who want their commits attributed to their personal identity create a **separate personal Forgejo account** themselves and link it to their HangarWiki identity. HangarWiki adds the personal account to the same team(s) as the managed account.

The user ends up with two Forgejo identities:
- **Managed account** (`<derived-username>` on the Forgejo instance, HangarWiki holds a PAT for it) — used by HangarWiki on the user's behalf, never visible to the user.
- **Personal account** (any handle they want, on the same Forgejo instance or any compatible one) — used by the user for direct work.

## Consequences

### Good

- **Permanent service identity.** The managed account never changes hands. HangarWiki's PAT keeps working across the user's lifetime; no "credentials handed over and now the user might rotate them out from under us" scenario.
- **Clean separation of responsibilities.** HangarWiki's automated actions show up under the managed account; the user's direct actions show up under their personal account. Commit history reads cleanly.
- **No password-handoff flow to design.** Option A would have required: a "set Forgejo password" or "reveal credentials" path, careful UX around making sure the user understands what's happening, and a story for what HangarWiki does when the user rotates the password. None of that has to exist.
- **Aligns with how Forgejo itself thinks about service accounts.** Bots and integrations are expected to be distinct identities from human users.

### Trade-offs

- **Two accounts per power user.** Slight conceptual overhead — the user has to understand that the account HangarWiki created and the account they create for direct use are different identities. The "link personal account" UI has to make this legible.
- **Personal-account creation is the user's job.** HangarWiki doesn't smooth the path of creating a personal Forgejo account on the configured instance. The "link" UI assumes the user has already done it.
- **Team membership has to be mirrored.** When HangarWiki adds the managed account to a team, it must also add the linked personal account (if linked) to the same team. Adds bookkeeping; not architecturally hard.

### Risks

- **Drift between managed and personal account membership.** If the personal account is added/removed from a team out-of-band (a Forgejo admin makes the change directly), HangarWiki's understanding desyncs. Mitigation: HangarWiki's mirror logic is best-effort and visibility cache (5-min ceiling) bounds the staleness window for reads. Writes always go through HangarWiki, which mirrors to both accounts.
- **Personal-account loss / instance migration.** If a user loses access to their personal account, the managed account still works through HangarWiki — they keep their wiki access. The personal account is additive, not replacing.

## Implementation notes

- The implementation plan in `plans/2026-05-26-adr-002-implementation/` is shaped for Option B. Phase 5's SSH-key UI registers keys against the **managed** account only; Phase 5 does not build the "link personal account" affordance.
- The "link personal account" affordance is a separate piece of work, slotted after Phase 6 cleanup. It needs:
  - A user-settings UI that asks for the personal-account username (and confirms with Forgejo that it exists).
  - Server-side mirror logic in the team-add / team-remove paths that adds/removes the linked personal account alongside the managed one.
  - A "linked" field on the `users` row pointing at the personal Forgejo username (nullable; null = no linked account).
- HangarWiki never holds credentials for the personal account. All HangarWiki-initiated actions still go through the managed account's PAT.
- There is explicitly no "export managed credentials" or "set managed password" flow. The managed account is opaque to the user by design.

## Alternatives Considered

1. **Option A (take-over).** Rejected for the reasons in the Decision section: it forces a credential-handoff UX, blurs the line between automated and user actions in commit history, and breaks if the user rotates the password.
2. **Hybrid (managed account by default, optional take-over).** Rejected as worst-of-both: code paths exist for both models, and the user has to make a choice they don't yet know how to make. Better to pick one.
3. **No power-user direct access at all.** Rejected — power users push directly via git over SSH today; removing that capability would be a regression.

## References

- ADR 002 (the open question this resolves): `adr/002-delegate-authz-to-forgejo.md`
- Implementation plan: `plans/2026-05-26-adr-002-implementation/`
