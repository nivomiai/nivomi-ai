# ADR-009: Clerk for authentication, Nivomi-owned authorization

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Nivomi needs secure sign-in, MFA, session management and organization membership without building
an identity system. Authorization (what a member may do with which tenant's data) is core business
logic that must stay under Nivomi's control and be testable.

## Decision

- **Clerk** handles authentication, sessions and MFA. **Clerk Organizations** is the source of
  organization and membership identity.
- **Nivomi owns authorization.** The API verifies the Clerk session token, maps the Clerk
  organization to a Nivomi `organization` row and the member to a Nivomi membership with a Nivomi
  role: `OWNER`, `ADMIN`, `MANAGER`, `AGENT`, `ANALYST`, `VIEWER`. Policies are evaluated by a
  central authorization layer in the API, never from Clerk role strings scattered in code.
- **Super Admin** is a Nivomi platform role, not a Clerk organization role. It is granted
  explicitly in Nivomi's database, always audited, and should require MFA.
- Tenant context always comes from the verified token's active organization, never from request
  parameters.
- Clerk user and organization changes reach Nivomi through verified Clerk webhooks
  (signature-checked, idempotent), with lazy provisioning on first authenticated request as a
  fallback.

## Consequences

- Clerk is on the critical path for sign-in; an outage blocks new sessions. Existing API requests
  depend only on local token verification (JWKS cached).
- Clerk stores user identity data outside Nivomi's AWS account. Its data residency must be checked
  against DPDP obligations (product-brief compliance items).
- MFA enforcement policy per role is set during security/PRD definition.
- Details (SDK choice for Nest and Next.js, token verification, webhook events) must follow
  Clerk's current official documentation at implementation time.
