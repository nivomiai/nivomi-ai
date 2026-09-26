# ADR-018: Nivomi-owned authentication (JWT + rotating refresh tokens)

- **Status:** Accepted, 2026-09-26. **Supersedes ADR-009** (Clerk).
- **Decided by:** the product owner, in the production implementation brief ("Do NOT use Clerk.
  Nivomi must own authentication").

## Context

ADR-009 chose Clerk and Clerk Organizations for identity. The owner reversed that choice, for
three reasons:

- keeping identity data and cost under Nivomi's control;
- keeping user data in Nivomi's own database in India (Clerk is US-only; PRD NFR-26);
- avoiding per-user SaaS pricing.

Authorization was already Nivomi-owned (ADR-009), and it stays that way.

## Decision

- **Passwords.** Argon2id through `@node-rs/argon2` (prebuilt binaries, no native toolchain),
  with OWASP parameters: m = 19 MiB, t = 2, p = 1.
  - The policy follows NIST 800-63B: 10–128 characters, no composition rules, and the password
    must not equal the email.
  - No plaintext password is ever stored or logged.
- **Access token.** A short-lived JWT: HS256, 15 minutes, signed through `jose`.
  - It carries only `sub` (user id), `sid` (session id), `iss`, `aud`, `iat` and `exp`.
  - The signing key comes from `AUTH_JWT_SECRET` (Secrets Manager in production), identified by
    `kid`. An optional `AUTH_JWT_PREVIOUS_SECRET` keeps verifying tokens during key rotation.
- **Sessions are server-side.** Every authenticated request checks that its session exists and
  is not revoked, so revocation takes effect immediately rather than at token expiry.
  - Sessions have a 30-day absolute lifetime.
  - Users can list their sessions and revoke them.
- **Refresh tokens.** Opaque 256-bit tokens.
  - Only their SHA-256 hash is stored. They rotate on every use, and each session is a token
    family.
  - **Reuse detection:** presenting an already-used token more than 30 s after its rotation
    revokes the whole session and writes an audit event.
  - Within those 30 s the response is `409 REFRESH_CONFLICT` with no revocation. Two browser
    tabs refreshing at once must not log the user out; the losing tab retries with the new
    cookie.
- **Browser transport: HttpOnly cookies**, never `localStorage`.

  | Cookie       | Flags                       | Scope and lifetime           |
  | ------------ | --------------------------- | ---------------------------- |
  | `nv_access`  | HttpOnly, `SameSite=Lax`    | `Path=/`, 15 min             |
  | `nv_refresh` | HttpOnly, `SameSite=Strict` | `Path=/api/v1/auth`, 30 days |
  | `nv_auth=1`  | Non-HttpOnly                | 30 days                      |
  - All three are `Secure` in production. `nv_auth` is a UX hint that holds no secret; the web
    app uses it to route between the site and the app.
  - **Same-origin deployment.** The browser calls the API at `/api/v1/*` on the web app's own
    origin: an ALB path rule routes it to the API service in production, and a Next.js route
    handler (`NIVOMI_API_ORIGIN`) forwards it in development and e2e. Cookies therefore stay
    host-only and first-party, and the web app's proxy can read the `nv_auth` hint.
    `AUTH_COOKIE_DOMAIN` exists only for a future split-subdomain topology.

- **CSRF.** `SameSite` cookies, plus an Origin check: every state-changing request must carry an
  `Origin` from the CORS allowlist.
- **Email verification and password reset.**
  - Tokens are single-use and random, stored hashed. They expire after 24 hours
    (verification) and 1 hour (reset).
  - A password reset or change revokes the user's other sessions.
  - Registration and forgot-password responses are identical whether or not the account exists,
    so accounts cannot be enumerated.
- **Abuse protection.**
  - Rate limits per IP and per email on register, login, forgot-password, verification and
    refresh (ADR-019).
  - After 5 failed logins the account locks for 15 minutes; failures and locks are audited.
- **Unverified users** can sign in, but only reach `/me`, verification and logout until they
  verify their email.
- **Boundaries (as implemented in Phase 1).** `AuthService` owns identity and session
  lifecycles; `TokenService` signs and verifies access tokens; `auth/password.ts` hashes and
  verifies passwords; `authorization/permissions.ts` is the single role → permission map, enforced
  by `AuthGuard` via `@RequirePermission`. Splitting `AuthService` into `IdentityService` and
  `SessionService` is planned once MFA and Super Admin identity work land (TECH_DEBT). Swapping in
  Auth0, Cognito, Keycloak or Clerk later replaces those internals, not the domain.

## Consequences

- **Nivomi now operates identity itself.** It owns breach response, secret rotation, password
  resets, and email deliverability (ADR-015, SES).
- **MFA is still required for owner, admin and Super Admin** (PRD FR-5), but is not built yet.
  TOTP comes in a later phase; until then those roles are unprotected by MFA. This is tracked in
  TECH_DEBT.
- **Organizations and memberships live only in Nivomi's database.** There is no external
  directory to sync.
- **Remaining ADR-009 content:** PRD FR-1 to FR-5 still hold, except that "Clerk" now means
  Nivomi auth. The claim that "Clerk stores identity data outside India" no longer applies.
