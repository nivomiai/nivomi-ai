---
title: 'Phase 11: Deploy and hardening — AWS adapters, infra, prod-readiness'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-030-deploy-and-hardening.md'
  - '{project-root}/docs/operations/production-readiness-checklist.md'
---

## Intent

**Problem.** Every adapter deferred in Phases 2–10 lands here, infra comes up, and the
production-readiness gate becomes the launch control.

**Approach.** Per ADR-030, one PR per adapter (eight), one PR for Terraform modules, one PR for
GitHub Actions deploy, one PR to flip the readiness checklist from "pending" to "pass".

Out of scope: multi-region, read replicas, chaos testing.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | Infra is platform-owned. Per-tenant data isolation already enforced in app layer (ADR-002/CLAUDE.md tenancy rule).                             |
| Source of truth          | AWS Secrets Manager for platform secrets; app DB for per-tenant encrypted credentials; `ApiEnv` for everything that can live in env.           |
| Authorization and audit  | Platform engineers access AWS via SSO (owner approves); production SUPER_ADMIN promotions logged via existing audit.                           |
| Provider failure         | Each adapter has retries, backoff and DLQ (ADR-019). The health check surfaces per-adapter status.                                             |
| Duplicate delivery       | S3 PUTs idempotent on key; SES send idempotent on templated-message-id; Razorpay webhooks idempotent on event id (already handled in Phase 8). |
| Worker crash / DB outage | ECS task restart; RDS Multi-AZ failover; cross-AZ Redis replication.                                                                           |
| Usage and cost           | ECS Fargate: 2 vCPU / 4 GiB for api, same for workers; RDS db.m6g.large; costs tracked in a dedicated FinOps dashboard (Phase 10).             |
| 100× scale               | Horizontal pod autoscaling (ECS service autoscaling) on CPU + request count. Voice workers scale by concurrent-call target.                    |

## Acceptance

- Eight adapter PRs merged with `npm run verify` green (each adapter PR runs its own
  integration tests against a sandbox or recorded fixtures).
- `infra/` Terraform modules apply cleanly in staging; `terraform plan` is clean on production
  before the launch deploy.
- GitHub Actions deploy pipeline green on `main` for staging and on a tagged release for
  production.
- `security-review` findings resolved or explicitly deferred.
- Load test results captured and stored under `docs/operations/load-tests/`.
- `docs/operations/production-readiness-checklist.md` all green.
- `npm run verify` green.

## Follow-ups (post-launch, not in Phase 11)

- Multi-region active/active (post-launch).
- Read replicas for analytics load.
- Chaos engineering experiments.
- SSO/SCIM for enterprise.
