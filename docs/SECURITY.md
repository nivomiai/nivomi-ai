# Security

## Implemented controls

| Control                 | Where                                                                                           | Verified by                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Secret hygiene in Git   | `.gitignore` blocks `.env*` (except `.env.example`), keys, certs, credentials, dumps, exports   | Manual review at bootstrap                        |
| Fail-fast configuration | `@nivomi/config` validates env at startup; no fallback secrets; messages never include values   | `packages/config/src/env.test.ts`                 |
| No env files in prod    | `loadEnvFiles` is a no-op when `NODE_ENV=production`                                            | `env.test.ts`                                     |
| HTTP hardening (API)    | helmet (CSP, HSTS, nosniff, frameguard, no `x-powered-by`)                                      | `apps/api/test/integration/http.test.ts`          |
| CORS allowlist          | Explicit origins only; required in production                                                   | integration + `apps/api/src/config/env.test.ts`   |
| Body size limit         | 1 MB JSON; oversized → 413, malformed → 400 (never 500)                                         | integration tests                                 |
| Error hygiene           | 5xx return a generic message; stack traces only in logs                                         | integration tests                                 |
| Log redaction           | Authorization, cookies, API keys, `*.password`/`token`/`secret`/`apiKey` redacted               | `apps/api/src/observability/logger.ts`            |
| Password storage        | Argon2id (m=19456, t=2, p=1), NIST length policy, fail-closed verify; never logged or returned  | `apps/api/src/auth/password.test.ts`              |
| Sessions and tokens     | 15-min JWT access token; opaque rotating refresh token stored as SHA-256; reuse revokes session | `apps/api/test/integration/auth.test.ts`          |
| Cookies                 | HttpOnly; refresh `SameSite=Strict` on `/api/v1/auth`; `Secure` in production; same-origin      | `auth.test.ts`                                    |
| CSRF                    | Origin allowlist on cookie-carrying unsafe requests, plus SameSite                              | `auth.test.ts` (CSRF)                             |
| Anti-enumeration        | Identical register/forgot responses; dummy Argon2 verify for unknown emails                     | `auth.test.ts`                                    |
| Brute-force protection  | Per-IP and per-email rate limits; 5 failures lock the account for 15 min (audited)              | `auth.test.ts`, `rate-limit.test.ts`              |
| RBAC + tenant isolation | Central permission map; tenant from session membership only; cross-tenant IDs resolve to 404    | `apps/api/test/integration/organizations.test.ts` |
| Audit log               | Auth and organization actions, in the same transaction as the change; no secrets in metadata    | `organizations.test.ts`                           |
| Open-redirect guard     | Post-login `next` limited to `/app` and `/invite` paths                                         | `apps/web/lib/app/format.test.ts`                 |
| Dev-only providers      | Dev mailbox and PGlite refused in production configuration                                      | `apps/api/src/config/env.test.ts`                 |
| Request-ID sanitizing   | Inbound IDs restricted to a safe charset and length (prevents log/header injection)             | `request-id.test.ts`                              |
| Web headers             | `X-Frame-Options: DENY`, nosniff, HSTS, Referrer-Policy, Permissions-Policy, no `x-powered-by`  | `tests/e2e/smoke.spec.ts`                         |
| Dependency audit        | `npm audit --omit=dev --audit-level=high` in `verify` and CI; Dependabot weekly                 | CI                                                |
| Least-privilege CI      | GitHub Actions `permissions: contents: read`                                                    | `.github/workflows/ci.yml`                        |

## Planned (not implemented)

MFA (TOTP) for owner, admin and Super Admin (ADR-018) · Redis-backed rate-limit store for
multi-instance deployments (ADR-019) · DPDP Act compliance
(notice, consent, retention, data-principal rights; ADR-014) · KMS envelope encryption for
HubSpot/provider tokens (ADR-010, ADR-012) · tenant isolation at DB level (possible RLS, ADR-008) · encrypted provider credentials
(envelope encryption, masked, rotatable) · webhook signature verification and replay protection ·
upload validation, safe storage keys and signed, expiring URLs · Super Admin audit views · nonce-based CSP for the web app · secret scanning (enable GitHub secret scanning
and push protection on the remote).

## Reporting

Report suspected vulnerabilities privately to the maintainers; do not open public issues.
