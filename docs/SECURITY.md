# Security

## Implemented controls

| Control                 | Where                                                                                          | Verified by                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Secret hygiene in Git   | `.gitignore` blocks `.env*` (except `.env.example`), keys, certs, credentials, dumps, exports  | Manual review at bootstrap                      |
| Fail-fast configuration | `@nivomi/config` validates env at startup; no fallback secrets; messages never include values  | `packages/config/src/env.test.ts`               |
| No env files in prod    | `loadEnvFiles` is a no-op when `NODE_ENV=production`                                           | `env.test.ts`                                   |
| HTTP hardening (API)    | helmet (CSP, HSTS, nosniff, frameguard, no `x-powered-by`)                                     | `apps/api/test/integration/http.test.ts`        |
| CORS allowlist          | Explicit origins only; required in production                                                  | integration + `apps/api/src/config/env.test.ts` |
| Body size limit         | 1 MB JSON; oversized → 413, malformed → 400 (never 500)                                        | integration tests                               |
| Error hygiene           | 5xx return a generic message; stack traces only in logs                                        | integration tests                               |
| Log redaction           | Authorization, cookies, API keys, `*.password`/`token`/`secret`/`apiKey` redacted              | `apps/api/src/observability/logger.ts`          |
| Request-ID sanitizing   | Inbound IDs restricted to a safe charset and length (prevents log/header injection)            | `request-id.test.ts`                            |
| Web headers             | `X-Frame-Options: DENY`, nosniff, HSTS, Referrer-Policy, Permissions-Policy, no `x-powered-by` | `tests/e2e/smoke.spec.ts`                       |
| Dependency audit        | `npm audit --omit=dev --audit-level=high` in `verify` and CI; Dependabot weekly                | CI                                              |
| Least-privilege CI      | GitHub Actions `permissions: contents: read`                                                   | `.github/workflows/ci.yml`                      |

## Planned (not implemented)

Authentication and MFA via Clerk, with Nivomi-owned RBAC (ADR-009) · DPDP Act compliance
(notice, consent, retention, data-principal rights; ADR-014) · KMS envelope encryption for
HubSpot/provider tokens (ADR-010, ADR-012) · RBAC policies and resource permissions · tenant
isolation at repository/DB level (+ possible RLS, ADR-008) · rate limiting (Redis-backed, so it
works across instances) · CSRF protection for cookie sessions · encrypted provider credentials
(envelope encryption, masked, rotatable) · webhook signature verification and replay protection ·
upload validation, safe storage keys and signed, expiring URLs · audit log for sensitive and Super
Admin actions · nonce-based CSP for the web app · secret scanning (enable GitHub secret scanning
and push protection on the remote).

## Reporting

Report suspected vulnerabilities privately to the maintainers; do not open public issues.
