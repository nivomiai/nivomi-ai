# Nivomi AI — Product Brief

> **Status:** Draft input for the BMAD PRD workflow (`bmad-prd`). Captured from the founding
> engineering brief (2026-09-23). Nothing here is implemented yet. Open questions at the end must
> be resolved during PRD/architecture.

## Vision

A multi-tenant SaaS platform that lets businesses deploy AI voice agents that call and answer
customers, act on the conversation (update status, book appointments, schedule follow-ups, hand
off to a human, sync the CRM) and measure outcomes and cost, all without developer involvement
for day-to-day operation.

## Customers / tenancy

- **Individual users**: a single-seat account.
- **Organizations**: teams with roles (ORG_OWNER, ORG_ADMIN, MANAGER, AGENT, OPERATOR, VIEWER).
- **Enterprise / custom tenants**: custom limits, integrations, later SSO and custom roles.
- **Platform operator**: SUPER_ADMIN, operating the platform through a control plane.

## Core value flow

```
Organization → Users/Roles → Customer data (CRM, Excel/CSV, API)
  → Unified customer model → Status & eligibility engine
  → AI agent runtime → Voice/communication → Conversation & decision
  → Business action → CRM / workflow → Analytics → Usage & billing
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

## Open questions (resolve in PRD / architecture)

1. **Launch markets and jurisdictions**: which countries first? This drives calling-hour, consent
   and DNC rules (e.g. TCPA, GDPR, national DND registries) and data residency.
2. **First voice/telephony provider** and phone-number strategy.
3. **Default LLM, STT and TTS providers** and latency budget for live calls.
4. **First CRM** integration.
5. **Billing/payment provider** and pricing model (per-minute, seats, tiers).
6. **Authentication approach**: build on a library vs. managed identity provider; MFA timing.
7. **Hosting platform and region(s)**.
8. **MVP persona and first workflow**: which single end-to-end journey proves value first?
