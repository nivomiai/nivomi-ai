# Nivomi infrastructure (Phase 11)

Terraform modules for AWS ap-south-1 deployment (ADR-010, ADR-030). This directory is a
**skeleton** — the real infrastructure is applied once the AWS hold is lifted by the owner
(see `docs/planning/status-holds-and-next.md`).

## Layout

```
infra/
  README.md              — this file
  main.tf                — root module composition
  variables.tf           — top-level variables
  providers.tf           — AWS, DNS, state backend
  modules/
    network/             — VPC, subnets, NAT, ALB-ready
    data/                — RDS PG 17 Multi-AZ, ElastiCache, S3, KMS
    app/                 — ECS Fargate: api / worker / voice-worker services
    email_sms/           — SES configuration set, Secrets Manager seed
    telephony/           — Exotel + Sarvam secrets, optional VPC endpoints
    observability/       — CloudWatch alarms + OTel exporter wiring
```

## State backend

S3-backed with DynamoDB locking (standard pattern). State bucket and table are **not** created
by this module (chicken-and-egg); they are provisioned once by hand or by a small bootstrap
module checked in later.

## Deploy flow

- `terraform plan` on PR to `develop` or `main` with the current workspace selected.
- `terraform apply` on push to `main` (staging) or on tagged release (production).
- The deploy workflow is under `.github/workflows/deploy.yml` (also a skeleton; see
  [production-readiness-checklist.md](../docs/operations/production-readiness-checklist.md)).

## Secrets

Platform secrets live in AWS Secrets Manager; task definitions reference them. Per-tenant
credentials (HubSpot refresh tokens, caller numbers DLT ids) stay in Nivomi DB, encrypted via
`KmsCredentialEncryptor` (envelope encryption with a per-org data key; KMS CMK rotates
annually). See `docs/decisions/ADR-030-deploy-and-hardening.md` §4.

## Rollback

- Blue/green ECS deploys with automatic rollback on health-check failure.
- Database migrations are forward-only; a bad migration is rolled forward by a reverse
  migration in a follow-up deploy. Snapshot-restore is the last resort.
- Feature flags on sensitive new features (Super Admin DB) so a bad behaviour can be switched
  off without a deploy.
