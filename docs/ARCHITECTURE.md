# Architecture

## 1. Implemented today (foundation)

```mermaid
flowchart LR
  Browser -->|HTTPS| Web[apps/web<br/>Next.js 16]
  Browser -->|/api/v1/*| API[apps/api<br/>NestJS 12]
  API --> Config[packages/config<br/>env validation]
  Web -. no API calls yet .-> API
```

| Component         | Responsibility                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/config` | Loads dev-only env files, validates env with zod, fails fast without echoing values                                                                          |
| `apps/api`        | HTTP API. Request pipeline: pino-http (request ID, structured log) → helmet → CORS allowlist → JSON body (1 MB) → versioned router → global exception filter |
| `apps/web`        | Public website (App Router, static): homepage, Coming Soon product pages, legal placeholders; brand tokens in Tailwind; no API calls yet                     |

API request lifecycle:

1. `resolveRequestId` accepts a well-formed inbound `x-request-id` or generates a UUID, echoes it
   on the response and binds it to every log line for the request.
2. helmet sets hardening headers; CORS allows only `CORS_ALLOWED_ORIGINS`.
3. Routes live under `/api/v{n}/` (URI versioning, default v1).
4. `AllExceptionsFilter` turns every error into the envelope in [API.md](API.md). 5xx details are
   logged, never returned.

Configuration is validated once at startup (`loadApiEnv`) and provided through DI as `API_ENV`.

## 2. Target architecture

**Style:** modular monolith + background workers + provider adapters (ADR-001). One deployable
API whose domains are isolated Nest modules with explicit public services; workers share the same
packages and consume queues. Any module can later be extracted into a service without rewriting
callers, because modules communicate through interfaces and events, not shared tables.

```mermaid
flowchart TB
  subgraph Clients
    WebApp[Web app / Super Admin]
    Webhooks[Provider webhooks]
  end
  subgraph API[apps/api — modular monolith]
    Auth[auth / tenancy / RBAC]
    Customer[customer + status engine]
    Elig[eligibility engine]
    Campaign[campaign]
    Agent[AI agent runtime + tool registry]
    Usage[usage + billing]
    Admin[super admin]
  end
  subgraph Workers
    WCampaign[campaign worker]
    WVoice[voice worker]
    WIntegration[CRM / integration worker]
    WWorkflow[workflow worker]
  end
  PG[(PostgreSQL)]
  Redis[(Redis / queues)]
  S3[(Object storage)]
  Providers[[LLM · STT · TTS · telephony · CRM · payments]]

  WebApp --> API
  Webhooks --> API
  API --> PG
  API --> Redis
  API --> S3
  Redis --> Workers
  Workers --> PG
  Workers --> Providers
  API -. outbox events .-> Redis
```

Initial providers and hosting (ADR-009 to ADR-014):

```mermaid
flowchart TB
  Org[Organization / user<br/>Clerk + Clerk Organizations] --> Campaign[AI voice campaign]
  SA[Super Admin control plane] -.-> Campaign
  Campaign --> Elig[Eligibility engine]
  Elig --> Compliance[ComplianceEngine<br/>India rule set]
  Elig --> Voice[VoiceProvider → Exotel]
  Voice <--> STT[STTProvider → Sarvam, streaming]
  Voice <--> TTS[TTSProvider → Sarvam, streaming]
  STT --> LLM[LLMRouter → LLMProvider]
  LLM --> TTS
  LLM --> Conv[Conversation + AI tools]
  Conv --> DB[(Nivomi PostgreSQL<br/>source of truth)]
  DB --> Outbox[Outbox → queue]
  Outbox --> CRMW[CRM sync worker]
  CRMW --> CRM[CRMProvider → HubSpot<br/>the organization's own account]
  DB --> Usage[Usage metering → PaymentProvider → Razorpay]
```

Everything runs in AWS ap-south-1 on ECS Fargate with RDS PostgreSQL, ElastiCache Redis and S3.
The voice runtime is a separate stateful worker service because calls are long-lived streaming
sessions.

Key rules (full list in [CLAUDE.md](../CLAUDE.md)):

- **Tenancy:** every tenant-owned row has `organization_id`; tenant context comes from the
  authenticated membership only. PostgreSQL row-level security is under evaluation as defense in
  depth (ADR-008).
- **Events:** state changes write an outbox row in the same transaction; a relay publishes to
  queues; consumers are idempotent (at-least-once delivery).
- **Providers:** domain code depends on `LLMProvider`, `VoiceProvider`, `STTProvider`,
  `TTSProvider`, `CRMProvider`, `PaymentProvider`, `StorageProvider`; vendor code lives in adapters.
- **Async by default** for campaigns, imports, exports, CRM sync and AI post-processing.

## 3. Gap between current and target

Everything in section 2 other than the HTTP foundation is **not built**. The order is set by
[ROADMAP.md](ROADMAP.md) and the BMAD PRD/architecture outputs. The data-access layer (ADR-008)
must be decided before the first persistent feature.
