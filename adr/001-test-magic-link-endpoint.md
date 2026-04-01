# ADR 001: Test Magic Link Endpoint

**Date:** 2026-03-31
**Status:** Accepted

## Context

Playwright e2e tests need to authenticate as a user. The auth flow is magic-link-based: the server sends an email with a one-time verify URL. In development, emails go to the console (no real email provider).

We needed a way for Playwright to retrieve the magic link URL programmatically after requesting one via `POST /api/auth/login`.

## Decision

We added `GET /api/auth/test/last-magic-link`, which returns the verify URL from the most recently sent console email. The route is only registered when **both** conditions are met:

1. `EMAIL_PROVIDER` is `console` (not Postmark, Resend, or any real provider)
2. `NODE_ENV` is not `production`

If either condition is false, the endpoint does not exist (404).

## Consequences

**Good:**
- Playwright tests can authenticate without parsing server stdout or mocking auth.
- The double gate makes accidental exposure in production unlikely — you'd need to both misconfigure the email provider *and* forget to set NODE_ENV.

**Risks:**
- If a staging environment runs with `EMAIL_PROVIDER=console` and no `NODE_ENV=production`, the endpoint is live. This would allow full account takeover (request magic link for any email, retrieve token, verify).
- The endpoint returns the *last* email sent to *any* address, not filtered by requester. In a multi-user dev environment this could leak another developer's login link.

**Mitigations:**
- Deployment documentation should mandate `NODE_ENV=production` for any non-local environment.
- The endpoint is not rate-limited but this is acceptable given it's dev-only.
- Future: consider requiring an explicit `ENABLE_TEST_ENDPOINTS=true` flag as a third gate if the risk profile changes.

## Alternatives Considered

1. **Parse server stdout from Playwright** — fragile, platform-dependent, requires capturing subprocess output.
2. **Query the database directly for the magic link token** — tokens are hashed (SHA-256) in the DB, so the raw token can't be retrieved.
3. **Mock the auth middleware in tests** — would skip testing the actual auth flow, defeating the purpose of e2e tests.
4. **Inject a test session cookie directly** — would require knowing the session token format and bypassing the normal flow.
