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

### Leads (PRD FR-18–FR-25, FR-130)

AGENTs see and edit only leads assigned to them; ANALYSTs read only; VIEWERs have no access.

| Method | Path                | Permission    | Body → Response                                                                                                                                                                      |
| ------ | ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/leads`            | `leads.read`  | `?limit&cursor&search&status&source&consent=with_basis\|missing&owner=me\|unassigned` → `{ items, nextCursor }`                                                                      |
| POST   | `/leads`            | `leads.write` | contact fields + `phone` (required) + optional `consentBasis`, `consentAt`, `consentSource`, `consentReference` → `201 { id }`; `409` if the phone/email matches an existing contact |
| GET    | `/leads/:id`        | `leads.read`  | → lead, contact, consent evidence, `sources` (External Record Links with connection state), `timeline`                                                                               |
| PATCH  | `/leads/:id`        | `leads.write` | any of `fullName`, `phone`, `email`, `company`, `jobTitle`, `city`, `state`, `country`, `preferredLanguage`, `ownerUserId` → `204`; changes go to the timeline                       |
| POST   | `/leads/:id/status` | `leads.write` | `{ status, reason? }` with optional `Idempotency-Key` header → `201 { changed }`                                                                                                     |

### Suppression list (FR-22)

| Method | Path               | Permission           | Body → Response                                                                       |
| ------ | ------------------ | -------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/suppression`     | `leads.read`         | `?limit&cursor` → `{ items: [{ id, phone, source, reason, createdAt }], nextCursor }` |
| POST   | `/suppression`     | `suppression.manage` | `{ phone, reason? }` → `201 { id, phone }`; `409` if already listed                   |
| DELETE | `/suppression/:id` | `suppression.manage` | → `204`; only `MANUAL`/`IMPORT` entries (opt-outs are permanent, `409`)               |

### Possible duplicates (FR-17)

| Method | Path                             | Permission       | Body → Response                                                                     |
| ------ | -------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| GET    | `/ingestion/reviews`             | `imports.manage` | → open items with the incoming record and candidate contacts                        |
| POST   | `/ingestion/reviews/:id/resolve` | `imports.manage` | `{ action: CREATE_NEW \| MERGE \| DISCARD, contactId? }` → `201 { status, leadId }` |

### File import (FR-14, FR-125–FR-128)

Flow: `POST /imports` → PUT the file to `upload.url` → `POST /imports/:id/uploaded` → (job)
`MAPPING_REQUIRED` → `PUT /imports/:id/mapping` → (job) `READY` with `preview` →
`POST /imports/:id/confirm` → (chunked job) `COMPLETED`. Nothing is written to leads before
`confirm`. All routes need `imports.manage` (MANAGER and above).

| Method | Path                        | Body → Response                                                                                                                                                               |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/imports`                  | `?limit&cursor` → import history                                                                                                                                              |
| GET    | `/imports/fields`           | → the Nivomi fields a column can map to                                                                                                                                       |
| POST   | `/imports`                  | `{ fileName (.csv/.xlsx), fileSize (≤ 20 MB) }` → `201 { id, upload: { url, method, headers, expiresAt } }`                                                                   |
| GET    | `/imports/:id`              | → status, headers, suggested mapping, preview, counts, first 5 rows while mapping                                                                                             |
| POST   | `/imports/:id/uploaded`     | → `200`; starts analysis                                                                                                                                                      |
| PUT    | `/imports/:id/mapping`      | `{ mapping: { column: field \| "custom:<name>" \| "ignore" }, defaultCountry?, consentDefault?: { basis, source?, reference?, attested: true } }` → `200`; starts the preview |
| POST   | `/imports/:id/confirm`      | → `200`; queues the import                                                                                                                                                    |
| POST   | `/imports/:id/cancel`       | → `204` (before confirmation)                                                                                                                                                 |
| GET    | `/imports/:id/error-report` | → `text/csv` of failed and review rows with reasons (download is audited)                                                                                                     |
| PUT    | `/uploads/:token`           | Public; the signed, 15-minute token authorizes one file (local storage adapter only)                                                                                          |

### CRM — HubSpot (FR-19, FR-84–FR-86, FR-137)

| Method | Path                                  | Permission                         | Body → Response                                                                             |
| ------ | ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/integrations/crm`                   | `integrations.read`                | → `{ available, connection (never tokens), runs }`                                          |
| POST   | `/integrations/crm/hubspot/authorize` | `integrations.manage`              | `{ confirmAccountChange? }` → `200 { authorizeUrl }`                                        |
| GET    | `/integrations/crm/hubspot/callback`  | Public (session cookie re-checked) | HubSpot redirect → `303` to `/app/data-sources?crm=<outcome>`                               |
| PUT    | `/integrations/crm/settings`          | `integrations.manage`              | `{ consentProperty, consentValueMap: { value: CONSENT_BASIS \| "DND" } }` → `204`           |
| POST   | `/integrations/crm/sync`              | `integrations.sync`                | `{ full? }` → `201 { id }`; `409` if a sync is running or the connection needs reconnecting |
| DELETE | `/integrations/crm`                   | `integrations.manage`              | → `204`; revokes and deletes tokens, keeps every lead                                       |

Callback outcomes: `connected`, `denied`, `invalid_state`, `signed_out`, `not_allowed`,
`account_in_use`, `account_change_requires_confirmation`, `provider_error`.

### Campaigns (FR-35–FR-43, ADR-021)

Lifecycle: `DRAFT` → (`prelaunch-check`, then `launch`) → `SCHEDULED` | `RUNNING` ⇄ `PAUSED` →
`COMPLETED` | `STOPPED`; a draft can be `CANCELLED`. `launch` needs a completed pre-launch check
newer than the last edit, with at least one ELIGIBLE or DEFERRED lead. Automatic pauses set
`pauseReason`: `EMERGENCY_STOP`, `COMPLAINT_BREAKER`, `BUDGET_EXHAUSTED`,
`TELECOM_IDENTITY_INVALID`, `CALLER_NUMBER_UNAVAILABLE`, `ORGANIZATION_NOT_ACTIVE`, `NO_RULE_SET`
(and `MANUAL`). OWNER, ADMIN and MANAGER manage; ANALYST reads.

| Method | Path                             | Permission                 | Body → Response                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/campaigns`                     | `campaigns.read`           | `?limit&cursor` → `{ items, nextCursor }`                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/campaigns`                     | `campaigns.manage`         | `{ name, callCategory: PROMOTIONAL\|SERVICE\|TRANSACTIONAL, type?: STATIC\|CONTINUOUS, callerNumberId, selection: { kind: FILTER, statuses?, sources? } \| { kind: LIST, leadIds }, windowStart?, windowEnd? (HH:MM, recipient time, inside the rule window), startsAt?, endsAt?, maxConcurrentCalls?, maxCallsPerHour?, maxAttempts? (≤ 3), retryIntervalMinutes? (≥ 240), maxAttemptsPerDay? (≤ 2), budgetMinutes }` → `201 { id }` |
| GET    | `/campaigns/:id`                 | `campaigns.read`           | → definition, `prelaunch` (`{ status, eligible, deferred, blocked, review, byReason, ruleSetVersion, stale }`) and `progress` (`leadsByState`, `liveCalls`, `remaining`, `outcomes`, `reasons`)                                                                                                                                                                                                                                       |
| PUT    | `/campaigns/:id`                 | `campaigns.manage`         | same body as POST → `204`; drafts only; clears the pre-launch check                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/campaigns/:id/prelaunch-check` | `campaigns.manage`         | → `202`; the dry run runs in chunked jobs and records a `PRE_LAUNCH` decision per lead                                                                                                                                                                                                                                                                                                                                                |
| POST   | `/campaigns/:id/launch`          | `campaigns.manage`         | → `204`; `409` without a fresh check, with zero callable leads, or while Emergency Stop or the breaker is on                                                                                                                                                                                                                                                                                                                          |
| POST   | `/campaigns/:id/pause`           | `campaigns.manage`         | → `204` (running or scheduled)                                                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/campaigns/:id/resume`          | `campaigns.manage`         | → `204`; `409` while Emergency Stop or the breaker is on, or the budget is used up                                                                                                                                                                                                                                                                                                                                                    |
| POST   | `/campaigns/:id/stop`            | `campaigns.manage`         | → `204`; ends a launched campaign for good                                                                                                                                                                                                                                                                                                                                                                                            |
| POST   | `/campaigns/:id/cancel`          | `campaigns.manage`         | → `204`; drafts only                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/campaigns/:id/leads`           | `campaigns.read`           | `?limit&cursor&state` → each lead's run state, attempts, next attempt and last reasons/outcome                                                                                                                                                                                                                                                                                                                                        |
| GET    | `/campaigns/:id/attempts`        | `campaigns.read`           | `?limit&cursor` → call attempts, newest first                                                                                                                                                                                                                                                                                                                                                                                         |
| POST   | `/campaigns/emergency-stop`      | `campaigns.emergency_stop` | `{ reason? }` → `201 { pausedCampaigns, liveCallsEnded }`; every dial is blocked until released                                                                                                                                                                                                                                                                                                                                       |
| DELETE | `/campaigns/emergency-stop`      | `campaigns.emergency_stop` | → `204`; campaigns stay paused until each is resumed                                                                                                                                                                                                                                                                                                                                                                                  |

### Eligibility, compliance and consent (FR-44–FR-52, ADR-014, ADR-021)

Every decision is `ELIGIBLE`, `BLOCKED`, `DEFERRED` or `REQUIRES_REVIEW` (precedence in that
reverse order) with reason codes. BLOCKED: `ORGANIZATION_NOT_ACTIVE`, `EMERGENCY_STOP_ACTIVE`,
`COMPLAINT_BREAKER_TRIPPED`, `TELECOM_IDENTITY_NOT_VERIFIED`, `TELECOM_IDENTITY_EXPIRED`,
`A2P_NOT_DECLARED`, `NO_CALLER_NUMBER`, `CALLER_NUMBER_NOT_ACTIVE`, `UNKNOWN_NUMBER_SERIES`,
`NUMBER_SERIES_NOT_PERMITTED`, `NO_CONSENT_BASIS`, `CONSENT_REVOKED`, `RECONSENT_BLOCK_ACTIVE`,
`CONSENT_BASIS_NOT_PERMITTED`, `CONSENT_OPERATOR_REFERENCE_MISSING`, `CONSENT_EXPIRED`,
`NO_DPDP_CONSENT`, `DPDP_CONSENT_REVOKED`, `DND_REGISTERED`, `NO_PHONE_NUMBER`, `SUPPRESSED`,
`LEAD_DO_NOT_CALL`, `LEAD_STATUS_EXCLUDED`, `MAX_ATTEMPTS_REACHED`, `CAMPAIGN_ENDED`. DEFERRED:
`PREFERENCE_REGISTRY_UNAVAILABLE`, `OUTSIDE_CALLING_HOURS`, `CAMPAIGN_NOT_STARTED`,
`COOLDOWN_ACTIVE`, `DAILY_ATTEMPT_CAP`, `CALL_IN_PROGRESS`, `ALREADY_CONNECTED_TODAY`,
`BUDGET_EXHAUSTED`. REQUIRES_REVIEW: `CONSENT_EVIDENCE_INCOMPLETE`, `PREFERENCE_CATEGORY_UNKNOWN`,
`UNKNOWN_JURISDICTION`, `MISSING_RULE`, `SECTOR_RULES_UNCONFIRMED`. Decisions appear on
`GET /leads/:id` as `timeline` entries of type `eligibility` (with calls as type `call`).

| Method | Path                              | Permission          | Body → Response                                                                                                                                                                                                                                 |
| ------ | --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/compliance/rule-sets`           | `compliance.read`   | → every Rule Set version with `status`, `pendingLegalReview`, effective dates, `sources` and `rules`                                                                                                                                            |
| GET    | `/compliance/controls`            | `compliance.read`   | → `{ emergencyStop, breaker }`                                                                                                                                                                                                                  |
| GET    | `/compliance/complaints`          | `compliance.review` | `?limit&cursor` → complaint records and operator flags                                                                                                                                                                                          |
| POST   | `/compliance/complaints`          | `compliance.review` | `{ kind: COMPLAINT\|OPERATOR_FLAG, callerNumberId?, leadId?, receivedAt?, reference?, note? }` → `201 { id, breakerTripped }`; pauses the named number                                                                                          |
| POST   | `/compliance/breaker/acknowledge` | `compliance.review` | `{ note? }` → `204`; first half of clearing the breaker                                                                                                                                                                                         |
| GET    | `/compliance/reviews`             | `compliance.review` | → open REQUIRES_REVIEW items with lead, campaign and reasons                                                                                                                                                                                    |
| POST   | `/compliance/reviews/:id/resolve` | `compliance.review` | `{ action: RECHECK\|EXCLUDE\|RECORD_CONSENT_DATE, consentAt?, note? }` → `204`; the lead is evaluated again before any call                                                                                                                     |
| GET    | `/leads/:id/consents`             | `leads.read`        | → `{ telecom: [...], dpdp: [...] }` ledger entries, newest first                                                                                                                                                                                |
| POST   | `/leads/:id/consents`             | `consent.manage`    | `{ ledger: TELECOM\|DPDP, kind: GRANT\|REVOCATION, basis? (telecom grant), purpose? (DPDP), evidenceAt?, evidenceSource?, reference?, operatorConsentReference?, recipientInitiated?, note? }` + optional `Idempotency-Key` → `201 { created }` |

### Telecom identity (FR-9–FR-13)

| Method | Path                            | Permission       | Body → Response                                                                                                                                                                                                                |
| ------ | ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/telecom-identity`             | `telecom.read`   | → identity with `status`, `effectiveStatus` (EXPIRED once self-certification lapses), `expiringSoon`, `numbers`, `permittedSeries`                                                                                             |
| PUT    | `/telecom-identity`             | `telecom.manage` | any of `legalName`, `dltEntityId`, `telemarketerName`, `telemarketerRegistrationId`, `sector`, `a2pDeclarationReference`, `a2pDeclaredAt`, `selfCertifiedAt` → `200`; a submitted or verified identity returns to `UNVERIFIED` |
| POST   | `/telecom-identity/submit`      | `telecom.manage` | → `201`; `UNVERIFIED` → `PENDING_REVIEW`; `400` lists missing details                                                                                                                                                          |
| POST   | `/telecom-identity/numbers`     | `telecom.manage` | `{ phone, purpose: PROMOTIONAL\|SERVICE, a2pDeclared }` → `201 { id, phone, series }`; `400` outside 140xx/1600xx/1601xx; `409` if assigned anywhere else                                                                      |
| DELETE | `/telecom-identity/numbers/:id` | `telecom.manage` | → `204`; the number is retired (kept for call history)                                                                                                                                                                         |

### Platform (Super Admin only, audited; the console arrives in Phase 9)

| Method | Path                                                  | Body → Response                                                               |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| POST   | `/platform/organizations/:id/telecom-identity/review` | `{ approve, reason? }` → `201`; `PENDING_REVIEW` → `VERIFIED` or `UNVERIFIED` |
| POST   | `/platform/organizations/:id/complaint-breaker/clear` | → `204`; `409` until an organization admin has acknowledged                   |

### AI Agents (FR-26–FR-32, ADR-022)

MANAGER and above build agents (`agents.manage`); ANALYST reads (`agents.read`). The draft may be
saved unfinished (its `problems` are returned); publishing needs a valid workflow and creates an
immutable version. Campaigns take an `agentVersionId` (same call category) and cannot launch
without one; every call attempt records it.

| Method | Path                                         | Permission      | Body → Response                                                                                                                    |
| ------ | -------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/agents`                                    | `agents.read`   | → `{ items }` with status, call category, latest version and its id, languages, tools                                              |
| GET    | `/agents/tools`                              | `agents.read`   | → the platform tool registry (name, label, description, side effect, audited)                                                      |
| POST   | `/agents`                                    | `agents.manage` | `{ name, callCategory: PROMOTIONAL\|SERVICE, purpose? }` → `201 { id }` with a valid starter workflow                              |
| GET    | `/agents/:id`                                | `agents.read`   | → `{ definition, problems, unpublishedChanges, versions, … }`                                                                      |
| PUT    | `/agents/:id`                                | `agents.manage` | `{ name?, callCategory?, definition? }` → the agent; `400` with details when the definition's shape is invalid                     |
| POST   | `/agents/:id/publish`                        | `agents.manage` | → `201 { id, version }`; `400` listing workflow problems; `409` when nothing changed                                               |
| POST   | `/agents/:id/archive`                        | `agents.manage` | → `204`; versions stay usable by campaigns already pinned to them                                                                  |
| GET    | `/agents/:id/versions/:versionId`            | `agents.read`   | → the frozen definition                                                                                                            |
| POST   | `/agents/:id/test-sessions`                  | `agents.manage` | `{ versionId? }` (omit to test the saved draft) → `201` session with the opening transcript                                        |
| GET    | `/agents/:id/test-sessions/:sessionId`       | `agents.manage` | → the session                                                                                                                      |
| POST   | `/agents/:id/test-sessions/:sessionId/turns` | `agents.manage` | `{ turn, text }` → `200` session; replaying an earlier `turn` returns it unchanged; `409` out of order or ended; `502` model error |

The definition is `{ personaName, companyName, purpose, primaryLanguage, otherLanguages, voice,
callLimits, recordingEnabled, escalation, knowledge (≤ 20,000), objectionGuidance, tools,
qualification: { mode: ALL|ANY, rules }, workflow: { nodes, edges } }`. Node types: `start`,
`question` (`key`, `prompt`, `answerType`: yes_no|single_choice|number|date|free_text, `options`),
`agent` (`instructions`, `maxTurns`), `handoff`, `end` (`outcome`: INTERESTED|NOT_INTERESTED|
CALLBACK_REQUESTED|COMPLETED). Edge conditions: `always`, `answer` (`key`, `op`: eq|neq|gt|gte|lt|lte|in,
`value`) and `intent` (affirm|deny|not_interested|callback); the first matching exit wins.
