# API

Base path: `/api/v{n}` (URI versioning; current version `v1`). JSON only; request bodies are
limited to 1 MB. Browsers call the API **same-origin** (`https://app…/api/v1/*`): the load
balancer routes the path to the API service in production, and a Next.js route handler forwards
it in development and e2e (`NIVOMI_API_ORIGIN`).

## Conventions

| Topic          | Rule                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correlation    | Every response carries `x-request-id`. Callers may send a well-formed `x-request-id` (8–128 chars of `A-Z a-z 0-9 . _ : -`) to join traces; anything else is replaced       |
| Errors         | Always the envelope below, with an HTTP status matching `code`                                                                                                              |
| Authentication | HttpOnly cookies set by `/auth/login` (`nv_access`, `nv_refresh`); non-browser clients may send `Authorization: Bearer <access token>`. See ADR-018                         |
| Tenancy        | Tenant endpoints act on the session's **active organization** (`/organizations/current/...`). The tenant is never read from a request parameter, body or header             |
| Authorization  | Each tenant endpoint declares one permission; roles map to permissions centrally (`apps/api/src/authorization/permissions.ts`, PRD §8.1)                                    |
| CSRF           | Unsafe methods carrying cookies (or an `Origin` header) must come from an origin in `CORS_ALLOWED_ORIGINS`                                                                  |
| Rate limits    | Per IP for the whole API, plus per-endpoint rules (login, registration, resets, token redemption, invitations). Exceeding one returns `429 RATE_LIMITED` with `Retry-After` |
| Lists          | Bounded; the audit log uses keyset (cursor) pagination. Other lists are capped server-side until they need paging                                                           |
| Idempotency    | Planned: `Idempotency-Key` header on side-effecting POSTs (with the first money- or call-moving endpoints)                                                                  |
| Validation     | Invalid input returns `400 VALIDATION_ERROR` with `details` as `field: message`; submitted values are never echoed                                                          |

## Error envelope

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many attempts. Please wait and try again.",
    "retryable": true,
    "requestId": "8f14e45f-ceea-4e7b-9f0a-2c3b1d5e6a70",
    "details": ["optional list, e.g. validation messages"]
  }
}
```

| Code                     | HTTP | Retryable | Meaning                                                        |
| ------------------------ | ---- | --------- | -------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | no        | Input failed validation, or a link/token is invalid or expired |
| `AUTHENTICATION_ERROR`   | 401  | no        | Not signed in, wrong credentials, or the session ended         |
| `AUTHORIZATION_ERROR`    | 403  | no        | Signed in but not allowed (role, origin, invitation mismatch)  |
| `EMAIL_NOT_VERIFIED`     | 403  | no        | The endpoint needs a verified email                            |
| `ORGANIZATION_REQUIRED`  | 403  | no        | No active organization membership on this session              |
| `NOT_FOUND`              | 404  | no        | Missing, or not visible to this tenant (never distinguished)   |
| `CONFLICT`               | 409  | no        | Duplicate, or a rule such as "keep at least one owner"         |
| `REFRESH_CONFLICT`       | 409  | yes       | Another tab refreshed the session a moment ago; retry          |
| `PAYLOAD_TOO_LARGE`      | 413  | no        | Body over 1 MB                                                 |
| `ACCOUNT_LOCKED`         | 423  | yes       | Too many failed sign-ins; retry after `Retry-After`            |
| `RATE_LIMITED`           | 429  | yes       | Too many requests; retry after `Retry-After`                   |
| `QUOTA_EXCEEDED`         | 429  | no        | Plan quota used up (reserved for metering)                     |
| `PROVIDER_ERROR`         | 502  | yes       | An external provider failed                                    |
| `TIMEOUT`                | 504  | yes       | A dependency did not answer in time                            |
| `DATABASE_ERROR`         | 503  | yes       | The database is unavailable                                    |
| `QUEUE_ERROR`            | 503  | yes       | Background work could not be scheduled                         |
| `SERVICE_UNAVAILABLE`    | 503  | yes       | The service is temporarily unavailable                         |
| `DEPENDENCY_UNAVAILABLE` | 503  | yes       | A required dependency (e.g. PostgreSQL) is down                |
| `INTERNAL_ERROR`         | 500  | no        | Unexpected failure                                             |

Messages of `AppError`s are written to be shown to end users. Unexpected errors always get a
generic message; the cause is logged server-side with the same `requestId`.

## Endpoints

All paths below are relative to `/api/v1`. "Unverified OK" means a signed-in user whose email is
not yet verified may call it; everything else that is not public requires a verified email.

### Health (public)

| Method | Path            | Response                                                                               |
| ------ | --------------- | -------------------------------------------------------------------------------------- |
| GET    | `/health`       | `200 { status: "ok", version, uptimeSeconds }` — liveness                              |
| GET    | `/health/ready` | `200 { status: "ready", checks: { database: "ok" } }`, or `503 DEPENDENCY_UNAVAILABLE` |

### Authentication

| Method | Path                        | Access        | Body → Response                                                                               |
| ------ | --------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`            | public        | `{ name, email, password }` → `202` (same response whether or not the email exists)           |
| POST   | `/auth/verify-email`        | public        | `{ token }` → `204`                                                                           |
| POST   | `/auth/resend-verification` | unverified OK | → `202`                                                                                       |
| POST   | `/auth/login`               | public        | `{ email, password }` → `204` + cookies                                                       |
| POST   | `/auth/refresh`             | public        | refresh cookie → `204` + rotated cookies; `409 REFRESH_CONFLICT` inside the 30 s grace window |
| POST   | `/auth/logout`              | public        | → `204`, session revoked, cookies cleared                                                     |
| POST   | `/auth/forgot-password`     | public        | `{ email }` → `202` (same response whether or not the email exists)                           |
| POST   | `/auth/reset-password`      | public        | `{ token, password }` → `204`; every session is revoked                                       |
| POST   | `/auth/change-password`     | signed in     | `{ currentPassword, newPassword }` → `204`; other sessions are revoked                        |
| GET    | `/auth/sessions`            | unverified OK | → `{ items: [{ id, userAgent, ipAddress, createdAt, lastSeenAt, current }] }`                 |
| DELETE | `/auth/sessions/:id`        | unverified OK | → `204` (own sessions only; others are `404`)                                                 |

### Me

| Method | Path                      | Access        | Body → Response                                                                      |
| ------ | ------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| GET    | `/me`                     | unverified OK | → `{ user, activeOrganization: { id, role, permissions } \| null, organizations[] }` |
| PUT    | `/me/active-organization` | signed in     | `{ organizationId }` → `204`; `404` unless the caller is a member                    |

### Organizations

| Method | Path                                      | Permission            | Body → Response                                              |
| ------ | ----------------------------------------- | --------------------- | ------------------------------------------------------------ |
| POST   | `/organizations`                          | signed in             | `{ name }` → `201` organization; caller becomes OWNER        |
| GET    | `/organizations/current`                  | `organization.read`   | → `{ id, name, slug, status, role }`                         |
| GET    | `/organizations/current/members`          | `members.read`        | → `{ items: [{ id, userId, name, email, role, joinedAt }] }` |
| PUT    | `/organizations/current/members/:id/role` | `members.update_role` | `{ role }` → `204`                                           |
| DELETE | `/organizations/current/members/:id`      | `members.remove`      | → `204`                                                      |
| POST   | `/organizations/current/leave`            | `organization.read`   | → `204` (the last owner cannot leave: `409`)                 |
| GET    | `/organizations/current/invitations`      | `members.invite`      | → `{ items: [{ id, email, role, createdAt, expiresAt }] }`   |
| POST   | `/organizations/current/invitations`      | `members.invite`      | `{ email, role }` → `201`; the email is sent by a job        |
| DELETE | `/organizations/current/invitations/:id`  | `members.invite`      | → `204`                                                      |
| POST   | `/organizations/invitations/accept`       | signed in             | `{ token }` → `201` organization; email must match           |
| GET    | `/organizations/current/audit-logs`       | `audit.read`          | `?limit=1..100&cursor=` → `{ items, nextCursor }`            |

Role rules (PRD FR-2): only an OWNER grants or changes OWNER/ADMIN; an ADMIN cannot modify or
remove owners or admins; an organization always keeps at least one OWNER. Role changes and
removals take effect on the member's next request.
