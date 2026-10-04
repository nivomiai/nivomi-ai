# Architecture Decision Records

ADRs live in [decisions/](decisions/). Add one for every decision that is expensive to reverse:
framework, data store, provider strategy, auth, tenancy model, billing semantics. Status is
`Proposed` → `Accepted` → (`Superseded by ADR-xxx`).

| ADR                                                                            | Title                                                                   | Status                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------- |
| [ADR-001](decisions/ADR-001-modular-monolith.md)                               | Modular monolith with workers                                           | Accepted              |
| [ADR-002](decisions/ADR-002-monorepo-toolchain.md)                             | npm-workspaces monorepo and TypeScript toolchain                        | Accepted              |
| [ADR-003](decisions/ADR-003-nestjs-api.md)                                     | NestJS 12 (ESM) for the API                                             | Accepted              |
| [ADR-004](decisions/ADR-004-nextjs-web.md)                                     | Next.js App Router + Tailwind for the web app                           | Accepted              |
| [ADR-005](decisions/ADR-005-testing-strategy.md)                               | Vitest + Playwright testing strategy                                    | Accepted              |
| [ADR-006](decisions/ADR-006-configuration.md)                                  | Centralized, fail-fast configuration                                    | Accepted              |
| [ADR-007](decisions/ADR-007-bmad-method.md)                                    | BMAD Method as the delivery process                                     | Accepted              |
| [ADR-008](decisions/ADR-008-data-access-layer.md)                              | PostgreSQL data-access layer: Drizzle, PGlite for tests                 | Accepted              |
| [ADR-009](decisions/ADR-009-identity-clerk.md)                                 | Clerk authentication, Nivomi-owned authorization                        | Superseded by ADR-018 |
| [ADR-010](decisions/ADR-010-hosting-aws.md)                                    | AWS ap-south-1 hosting on ECS Fargate                                   | Accepted              |
| [ADR-011](decisions/ADR-011-voice-pipeline-providers.md)                       | Voice pipeline: Exotel, Sarvam, LLMRouter                               | Accepted              |
| [ADR-012](decisions/ADR-012-hubspot-crm.md)                                    | HubSpot CRM, per-tenant OAuth, Nivomi as source of truth                | Accepted              |
| [ADR-013](decisions/ADR-013-billing-razorpay.md)                               | Nivomi-owned billing with Razorpay                                      | Accepted              |
| [ADR-014](decisions/ADR-014-compliance-engine.md)                              | Jurisdiction-aware ComplianceEngine, India first                        | Accepted              |
| [ADR-015](decisions/ADR-015-email-otp-providers.md)                            | Amazon SES for email, MSG91 for OTP                                     | Accepted              |
| [ADR-016](decisions/ADR-016-observability-otel-grafana.md)                     | OpenTelemetry to Grafana Cloud; CloudWatch for AWS infrastructure       | Accepted              |
| [ADR-017](decisions/ADR-017-data-ingestion-crm-optional.md)                    | One ingestion path into the Contact/Lead domain; CRM optional           | Accepted              |
| [ADR-018](decisions/ADR-018-nivomi-owned-auth.md)                              | Nivomi-owned authentication: JWT + rotating refresh tokens              | Accepted              |
| [ADR-019](decisions/ADR-019-jobs-and-rate-limiting.md)                         | PostgreSQL-backed jobs; pluggable rate-limit stores                     | Accepted              |
| [ADR-020](decisions/ADR-020-lead-ingestion-and-hubspot-inbound.md)             | Lead data model, file import, HubSpot inbound sync                      | Accepted              |
| [ADR-021](decisions/ADR-021-compliance-rule-data-and-eligibility-decisions.md) | Compliance rule data, eligibility decision record, campaign execution   | Accepted              |
| [ADR-022](decisions/ADR-022-ai-agents-and-conversation-workflows.md)           | AI Agents, conversation workflows, versions and the conversation engine | Accepted              |
