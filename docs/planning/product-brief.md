# Nivomi AI — Product Brief

> **Status:** Input for the BMAD PRD workflow (`bmad-prd`). Captured from the founding engineering
> brief (2026-09-23); launch decisions resolved 2026-09-25 (see [Resolved decisions](#resolved-decisions)).
> Nothing here is implemented yet.

## Vision

A multi-tenant SaaS platform that lets businesses deploy AI voice agents that call and answer
customers, act on the conversation (update status, book appointments, schedule follow-ups, hand
off to a human, sync the CRM) and measure outcomes and cost, all without developer involvement
for day-to-day operation.

## Customers / tenancy

- **Target persona (MVP):** SMB and mid-market sales teams in India.
- **Individual users**: a single-seat account.
- **Organizations**: teams with roles Owner, Admin, Manager, Agent, Analyst, Viewer.
- **Enterprise / custom tenants**: custom limits, integrations, later SSO and custom roles.
- **Platform operator**: Super Admin, operating the platform through a control plane.

## Core value flow

```
Organization → Users/Roles → Customer data (HubSpot, Excel/CSV, API)
  → Unified customer model → Status engine → Eligibility (incl. ComplianceEngine)
  → AI agent runtime → VoiceProvider (Exotel) + Sarvam STT/TTS + LLMRouter
  → Conversation & decision → Business action → Nivomi DB → Event/queue
  → CRM sync worker → HubSpot (the organization's own account) → Analytics → Usage & billing
```

## Capabilities

| Area                      | Scope                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer data             | Excel/CSV import as a _data source_ (upload → validate → map columns → preview → dedupe → async import → report); CRM and API sources; import history, partial success, retry                                                                                                                                         |
| Customer status engine    | Default lifecycle (NEW, CONTACTED, ATTEMPTED, CONNECTED, INTERESTED, QUALIFIED, CALLBACK_REQUESTED, FOLLOW_UP, APPOINTMENT_BOOKED, CONVERTED, NOT_INTERESTED, UNREACHABLE, DO_NOT_CALL, CLOSED) plus org-defined statuses; every transition recorded with old/new status, source, actor, reason, metadata; idempotent |
| Eligibility engine        | Consent, DNC, status, campaign rules, calling hours, retry limits, cooldown, jurisdiction, org policy, budget → ELIGIBLE / BLOCKED / DEFERRED / REQUIRES_REVIEW. Mandatory before any outbound contact                                                                                                                |
| AI voice agents           | Inbound and outbound calls; STT → LLM → TTS; recordings, transcripts, summaries, outcomes; registered tools (getCustomer, updateCustomer, createAppointment, scheduleFollowUp, sendMessage, CRM read/write, transferToHuman, endCall)                                                                                 |
| Campaigns                 | Async, resumable outbound campaigns: scheduling, pause/resume, concurrency, retries, timezone, DNC/consent, budget and volume limits                                                                                                                                                                                  |
| Workflows & follow-ups    | Event-triggered automations (status change, call outcome, appointment)                                                                                                                                                                                                                                                |
| CRM integration           | Provider-agnostic (HubSpot, Salesforce, Zoho later); CRM failure never blocks business events; sync status PENDING/SYNCING/SYNCED/FAILED/RETRYING                                                                                                                                                                     |
| Analytics                 | Call outcomes, conversion, campaign performance, cost                                                                                                                                                                                                                                                                 |
| Usage & billing           | Server-side metering of call minutes, telephony, STT, LLM tokens, TTS, recordings, CRM ops, workflow runs; plans → limits → alerts → overage → invoices                                                                                                                                                               |
| Super Admin control plane | Organizations, users, plans/limits, AI/voice/CRM provider configuration (encrypted, masked, verify/rotate/disable, health), billing, usage, campaigns oversight, system health, feature flags, audit logs                                                                                                             |

## Non-functional requirements

- Strict tenant isolation at every layer, tested.
- Provider independence (LLM, voice, STT, TTS, CRM, payments, storage).
- Horizontal scalability: stateless API, queue workers, pagination, bulk processing.
- Cost control: per-org/campaign/user limits, alerts, emergency stop, AI loop protection.
- Auditability of every sensitive and administrative action.
- Observability: structured logs, metrics, correlation IDs, health checks.
- Security: MFA-ready auth, RBAC, webhook signatures, file upload safety, secret encryption.

## MVP boundary

Explicitly **deferred** unless approved: additional CRMs beyond the first, advanced analytics,
multi-region, advanced SSO, API marketplace, advanced AI evaluation, lead scoring, dedicated
tenant infrastructure.

## MVP journey

The MVP proves one complete end-to-end workflow rather than breadth of AI automation:

```
Lead → AI outbound call → Qualification → Interested / Not interested
  → Appointment scheduling → Human handoff when required → Transcript
  → AI summary → CRM sync (HubSpot) → Usage tracking → Analytics
```

## Resolved decisions

Recorded 2026-09-25 by the product owner. Architecture consequences are in the ADRs.

| #   | Topic                    | Decision                                                                                                                                                                                                                                                                                                                      | ADR                                                         |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Markets & compliance     | **India first.** Jurisdiction-aware `ComplianceEngine`; calling hours, consent, DND/opt-out, recording, privacy and retention rules are configurable per jurisdiction, never hard-coded in campaign logic. Languages: English, Hindi, Malayalam, Tamil, Telugu, Kannada                                                       | [ADR-014](../decisions/ADR-014-compliance-engine.md)        |
| 2   | Telephony                | **Exotel** behind `VoiceProvider`. Number provisioning, ownership, routing, caller ID and number lifecycle isolated in the provider layer                                                                                                                                                                                     | [ADR-011](../decisions/ADR-011-voice-pipeline-providers.md) |
| 3   | STT / TTS / LLM          | **Sarvam** STT and TTS. LLM is provider-independent via `LLMProvider`/`LLMRouter`; the default model is chosen by evaluation (accuracy, latency, cost, Indic-language quality, reliability, availability). Streaming STT/TTS, barge-in and provider fallback required. Turn-latency **target** (not SLA): < 1.5–2 s perceived | [ADR-011](../decisions/ADR-011-voice-pipeline-providers.md) |
| 4   | CRM                      | **HubSpot** for MVP. Each organization connects its own HubSpot account via tenant-scoped OAuth. Nivomi PostgreSQL is authoritative for Nivomi data; sync is async with retries, idempotency, webhooks and rate-limit handling                                                                                                | [ADR-012](../decisions/ADR-012-hubspot-crm.md)              |
| 5   | Billing                  | **Razorpay** behind `PaymentProvider`; Nivomi owns the billing domain. Subscription + included usage + metered overage, computed server-side. Tiers and included usage decided in PRD/business model                                                                                                                          | [ADR-013](../decisions/ADR-013-billing-razorpay.md)         |
| 6   | Identity                 | **Clerk** authentication + **Clerk Organizations** for org/membership identity. Nivomi owns authorization and RBAC (Owner, Admin, Manager, Agent, Analyst, Viewer; Super Admin for the control plane). MFA supported; enforcement policy set in security/PRD                                                                  | [ADR-009](../decisions/ADR-009-identity-clerk.md)           |
| 7   | Hosting                  | **AWS ap-south-1 (Mumbai)**: ECS/Fargate, RDS PostgreSQL, ElastiCache Redis, S3, CloudFront, ALB, ECR, Secrets Manager, KMS, CloudWatch. EKS deferred                                                                                                                                                                         | [ADR-010](../decisions/ADR-010-hosting-aws.md)              |
| 8   | Persona & first workflow | SMB and mid-market sales teams; the MVP journey above                                                                                                                                                                                                                                                                         | —                                                           |

## Still open (PRD / architecture)

- Pricing tiers, included usage per plan, overage rates.
- Default LLM model(s): needs an evaluation set of Indic-language sales conversations.
- MFA enforcement policy per role (Super Admin at minimum).
- **Appointment scheduling target:** HubSpot meetings, an external calendar (Google/Microsoft), or
  a Nivomi-native calendar?
- **Human handoff mechanism:** live call transfer via Exotel to a rep's number, a queued callback,
  or both? What happens outside business hours?
- Consent capture: how do customers prove consent for imported leads?
- Recording and transcript retention defaults per jurisdiction.

## Compliance items to verify (from official sources, before the PRD is final)

These are known to be relevant for AI outbound calling in India but must be confirmed against
current regulator and provider documentation, not assumed:

- TRAI commercial-communication rules (TCCCPR) and the DND / National Customer Preference
  Register: registration obligations, DLT (distributed-ledger) consent and header registration,
  permitted number series for promotional vs. transactional/service calls, calling-hour limits.
- Digital Personal Data Protection Act 2023 and its Rules: notice, consent, purpose limitation,
  retention, data-principal rights, breach reporting, cross-border transfer.
- Call recording and AI-disclosure expectations.
- Data residency of third parties that hold personal data (Clerk, Sarvam, the chosen LLM
  provider, HubSpot, Razorpay) relative to hosting in ap-south-1.

Suggested method: `bmad-deep-recon` (domain research) → findings feed ADR-014 and the PRD.
