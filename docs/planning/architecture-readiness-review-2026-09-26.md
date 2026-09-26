# Architecture readiness review — 2026-09-26

> **Input:** the owner's "Master production architecture prompt" (2026-09-26).
> **Output:** this review; PRD revision 2 ([prd.md](prds/prd-Nivomi-2026-09-26/prd.md)); ADR-015,
> ADR-016 and ADR-017; updates to CLAUDE.md, ARCHITECTURE.md and the ADR index.
> **Status:** input to `bmad-architecture`. Nothing here is implemented.

## 1. What was inspected

| Area                                                  | Finding                                                                                                                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository and code                                   | Foundation only. npm-workspaces monorepo; NestJS 12 API with a liveness check; Next.js 16 shell; `@nivomi/config` env validation; pino logging with request IDs; Vitest and Playwright; CI. `npm run verify` passed at bootstrap. |
| Authentication, database, API, frontend, integrations | **None exists yet.** There are no Clerk, database, provider or CRM integrations. Nothing is "working architecture" that needs preserving beyond the foundation and the accepted ADRs.                                             |
| Git                                                   | Branch `docs/prd` (from `docs/product-decisions`). `main` ← `develop` ← `feature/*` / `docs/*` flow. Remote `origin` = github.com/nivomiai/nivomi-ai; author `Nivomi Team <nivomiai@gmail.com>`.                                  |
| BMAD                                                  | v6.12.0 in `_bmad/` and `.claude/skills/`. `uv` is missing, so BMAD scripts run with `python`. Planning artifacts live in `docs/planning/`.                                                                                       |
| Planning                                              | Product brief; India compliance research (2026-09-25); PRD draft (2026-09-26), now revision 2.                                                                                                                                    |
| ADRs                                                  | 001–014, all accepted except ADR-008 (data access, proposed). This review adds 015–017.                                                                                                                                           |

## 2. Contradictions found and how they were resolved

| #   | Contradiction                                                                                                    | Resolution                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | The PRD draft deferred inbound calls to after the MVP; the prompt makes them core                                | Inbound calls are in the MVP (PRD §8.17, FR-139–145, AC-10). Contact-centre features stay deferred.        |
| 2   | The PRD draft said "HubSpot required"; the prompt says no tenant has to connect a CRM                            | The HubSpot integration ships, but connecting it is optional (FR-136; ADR-017 amends ADR-012).             |
| 3   | ADR-010 used CloudWatch for logs and metrics; the prompt adds OpenTelemetry and Grafana Cloud                    | ADR-016: OpenTelemetry to Grafana Cloud (India region) for the application; CloudWatch for AWS.            |
| 4   | The prompt's "Use Clerk where possible to avoid SMS cost" vs Clerk's SMS, which is US and Canada only by default | Sign-in uses email plus authenticator-app MFA; MSG91 only for phone verification (FR-147, ADR-015).        |
| 5   | OTP SMS through MSG91 needs Nivomi's **own** DLT registration and templates                                      | New launch gate (AC-6 item 11) and risk RK-20.                                                             |
| 6   | Inbound numbers and a Lead's return calls vs promotional 140xx numbers, believed to be outbound-only             | Two kinds of number (FR-139); risk RK-17; question VQ-13.                                                  |
| 7   | "Live transfer primary" vs Exotel, whose Voicebot stream closes before the next applet runs                      | Unchanged one-way-exit design; transfer through "Connect with Flow" or Programmable Voice (addendum §2).   |
| 8   | The prompt's transfer-failure chain (retry → callback → task → CRM) vs the PRD's shorter chain                   | FR-76 now has a bounded retry across up to 2 destinations, then a callback, a Human Task and a CRM update. |
| 9   | The PRD modelled only "Lead"; the prompt requires Contact, Lead and Company                                      | Glossary updated. The data model is decided in architecture (PRD assumption A-79).                         |
| 10  | The PRD's "Duplicates are merged under a rule" vs "never auto-merge uncertain records"                           | FR-17 now uses `CREATE`/`UPDATE`/`SKIP`/`REVIEW`, and uncertain matches go to review.                      |
| 11  | `CalendarProvider`, `EmailProvider`, `OtpProvider` and `FileImportProvider` were missing from CLAUDE.md          | Added to CLAUDE.md and ARCHITECTURE.md. The `CalendarProvider` ADR comes in architecture (OD-1).           |

## 3. Provider checks made today

These checks were made through web search on 2026-09-26. They cover **capability only; no pricing
was verified** (see §M, step 2).

| Claim                                                                                                                                                                                                                       | Source                                                                                                                                                                                 | Result                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Exotel supports **outbound** AI calls: `POST /v1/Accounts/{AccountSid}/Calls/connect` with `StreamUrl` and bidirectional `StreamType`, sample rate 8/16/24 kHz, `TimeLimit` up to 14,400 s, optional dual-channel recording | [Connect Voice AI API](https://developer.exotel.com/docs/agentstream/connect-voice-ai)                                                                                                 | Verified from the documentation; VQ-1 partly answered                |
| Transfer is not part of that API; use "Connect with Flow" or Programmable Voice. In the Voicebot applet, the stream closes before the next applet runs. A `clear` event supports barge-in                                   | [Connect Voice AI API](https://developer.exotel.com/docs/agentstream/connect-voice-ai), [Stream/Voicebot applet](https://developer.exotel.com/docs/agentstream/stream-voicebot-applet) | Verified from the documentation; mid-stream transfer not documented  |
| Exotel markets AgentStream for inbound and outbound calls, including "lead verification and qualification"                                                                                                                  | [Exotel blog, 30 Jul 2025](https://exotel.com/blog/voice-ai-infrastructure-exotel-agentstream/)                                                                                        | Vendor marketing                                                     |
| Grafana Cloud has an India region (AWS `ap-south-1`, and GCP `asia-south1`)                                                                                                                                                 | [Grafana regional availability](https://grafana.com/docs/grafana-cloud/security-and-account-management/regional-availability/)                                                         | Verified; which signals it stores is unconfirmed (VQ-14)             |
| Sarvam streaming STT is a WebSocket API. Saaras v3 covers 22 Indian languages plus English and is optimized for 8 kHz telephony. Saarika v2.5 (11 languages) is being deprecated in favour of Saaras                        | [Sarvam streaming STT](https://docs.sarvam.ai/api-reference-docs/speech-to-text/apis/streaming), [Saarika model](https://docs.sarvam.ai/api/getting-started/models/saarika)            | Verified from the documentation; quality still to be measured (VQ-9) |
| Clerk enables SMS only for the US and Canada by default; India must be allowlisted                                                                                                                                          | [Clerk sign-up and sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)                                                                   | Verified (search summary of the documentation)                       |
| Every SMS to Indian numbers, including OTPs, needs DLT entity, header and template registration; OTPs are transactional                                                                                                     | [MSG91 DLT help](https://msg91.com/help/dlt-registration-in-india)                                                                                                                     | Verified (vendor documentation)                                      |
| Amazon SES is available in ap-south-1                                                                                                                                                                                       | [AWS SES endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html)                                                                                                            | Verified (search summary)                                            |
| 140xx is the telemarketing series; the DND registry blocks it by sector                                                                                                                                                     | [MediaNama, Jul 2026](https://www.medianama.com/2026/07/223-trai-releases-clarification-designated-promotional-transactional-number-series/)                                           | Whether it can receive inbound calls is **not** verified (VQ-13)     |

## A. Locked decisions

Locked by the owner, 2026-09-26, together with ADR-009 to ADR-017:

- **Market and scope:**
  - India first; languages en, hi, ml, ta, te, kn.
  - SMB and mid-market sales teams; vertical-agnostic.
  - Outbound **and inbound** AI calls in the MVP; human escalation is first-class.
- **Providers**, each behind its abstraction (none is permanent):

  | Area          | Provider                                                                                       |
  | ------------- | ---------------------------------------------------------------------------------------------- |
  | Identity      | Clerk, with Clerk Organizations and Nivomi-owned RBAC (six roles + Super Admin)                |
  | Email         | Amazon SES                                                                                     |
  | OTP           | MSG91                                                                                          |
  | Telephony     | Exotel                                                                                         |
  | STT and TTS   | Sarvam                                                                                         |
  | LLM           | Configurable, with the model chosen by evaluation                                              |
  | CRM           | HubSpot, per tenant, optional                                                                  |
  | Payments      | Razorpay (subscription + Included Usage + Overage)                                             |
  | Hosting       | AWS ap-south-1 (ECS Fargate, RDS, ElastiCache, S3, CloudFront, ALB, ECR, Secrets Manager, KMS) |
  | Observability | OpenTelemetry, Grafana Cloud, CloudWatch                                                       |

- **Data:**
  - Nivomi's Contact, Lead and Company records are the operational source of truth.
  - Excel, CSV, CRM, manual and inbound sources all converge through one ingestion path.
  - Campaigns never touch CRM objects.
- **Abstractions:**
  - `VoiceProvider`, `STTProvider`, `TTSProvider`, `LLMProvider`/`LLMRouter`, `CRMProvider`,
    `PaymentProvider`, `StorageProvider`, `CalendarProvider`, `EmailProvider`, `OtpProvider`,
    `FileImportProvider`.
  - Domain services: `ComplianceEngine`, `ConversationEngine`, `CallStateMachine`,
    `EscalationEngine`, `DataIngestionService`, `UsageMeter`.
- **Escalation:**
  - `EscalationEngine` decisions: `CONTINUE_AI`, `TRANSFER_TO_HUMAN`, `REQUEST_CALLBACK`,
    `CREATE_HUMAN_TASK`, `END_WITH_FALLBACK`.
  - AI failure leads to a controlled recovery, never a call failure.
  - A calendar failure never produces a false confirmation.
  - A CRM failure never fails a call.
- **Out of MVP:**
  - Kubernetes, microservices, a multi-CRM or multi-payment launch, and multi-region.
  - Predictive scoring, and autonomous negotiation or closing.
  - WhatsApp, SMS or social automation, and proprietary models or telecom infrastructure.

## B. Assumptions

These are all in the PRD's §18 (A-1 to A-94). The ones added by revision 2 that matter most:

- **A-79:** one open Lead per Contact.
- **A-80:** transfer retry across up to 2 destinations.
- **A-85:** an inbound call counts as an `INQUIRY` consent basis.
- **A-88:** sign-in without SMS.
- **A-90:** a Grafana stack in India, with a long-term log archive in S3 Mumbai.
- **A-91:** Nivomi provisions numbers for each Organization.
- **A-93:** uploaded files deleted after 30 days.

Architecture-level assumptions for `bmad-architecture` to confirm or replace:

- **Queues:** Redis-backed (ElastiCache) queues, with Amazon SQS as the alternative. The choice is
  made in architecture.
- **Infrastructure as code:** Terraform or AWS CDK, chosen with the first infrastructure story.
- **Tenant isolation:** PostgreSQL row-level security as defense in depth on top of
  repository-level scoping (ADR-008).

## C. Remaining owner decisions

These are **[OWNER DECISION REQUIRED]** (PRD §16.1). Each has a default so that work continues.

| ID   | Decision                                                                        | Needed before               |
| ---- | ------------------------------------------------------------------------------- | --------------------------- |
| OD-1 | Default `CalendarProvider`: Google, Microsoft or HubSpot Meetings               | Appointment epic            |
| OD-2 | Telephony account model. Leaning: Nivomi-provisioned numbers per Organization   | Telephony and inbound epics |
| OD-3 | Consent-evidence standard for imported and CRM Leads                            | Ingestion epic              |
| OD-4 | Pricing: Plans, included minutes, overage, billable unit, inbound-number rental | Phase C                     |
| OD-5 | BFSI and insurance tenants in the design-partner cohort?                        | Phase B                     |
| OD-6 | Public lead-ingestion API or web-form webhook in the MVP?                       | Ingestion epic              |

## D. Architecture risks

1. **Scope and team size.** Inbound calls, two ingestion paths and escalation broaden the MVP. Share
   one voice runtime between inbound and outbound calls, and stage the epics (§N).
2. **The voice runtime is stateful and long-lived.** It needs:
   - sticky WebSocket sessions;
   - connection draining on deploy;
   - per-call state recovery.

   Keep it a separate worker service (ADR-010), with `CallStateMachine` state held in Redis and
   PostgreSQL.

3. **The data model** (Contact, Lead, Company, consent ledgers, External Record Links, sources) is
   the costliest thing to change later. Model it before the first persistent story, together with
   ADR-008.
4. **Transfer mechanics.** Handing over from the AI stream to a Connect flow depends on Exotel's
   call-flow design. Build a proof of concept before the escalation epic.
5. **Outbox and queue reliability** under at-least-once delivery, across imports, CRM sync, usage
   and notifications. Mitigate with idempotency keys everywhere and dead-letter queues with alerts.

## E. Security risks

- **Cross-tenant leaks** through workers, webhooks, the CRM portal-to-Organization mapping, S3
  keys, caches, analytics or AI context.
  - _Mitigation:_ the isolation suite (AC-2) and tenant context in every job payload.
- **Credential handling.** HubSpot tokens, provider keys and OTPs must use KMS envelope encryption,
  and OTPs are hashed. None may ever reach logs or telemetry (ADR-016 redaction before export).
- **Uploaded spreadsheets** carry personal data and formula-injection risk.
  - _Mitigation:_ signed short-lived URLs, validation, automatic deletion, safe CSV export.
- **Telephony fraud:** toll fraud, number misuse, and test calls to arbitrary numbers.
  - _Mitigation:_ OTP-verified numbers, rate limits and per-tenant pacing.
- **Prompt injection** by callers.
  - _Mitigation:_ registered tools only and platform guardrails (FR-34, FR-63, FR-64).
- **Super Admin power.**
  - _Mitigation:_ MFA, audit, no impersonation, and Support Access Grants.

## F. Compliance risks

- **Legal questions still open:**
  - whether Nivomi must register as a telemarketer or aggregator;
  - whether the inquiry window overrides DND;
  - how AI calls are classified;
  - the legal basis for recording;
  - whether verbal consent satisfies DPDP;
  - Nivomi's role as processor or fiduciary.

  These need counsel (VQ-3, VQ-4, VQ-6) before Phase B.

- **Operator sanctions** against a tenant's numbers.
  - _Mitigation:_ complaint breaker, pacing, answer-to-speech target (CR-8).
- **Inbound-derived consent (A-85)** and 140xx callback behaviour are unverified (VQ-13).
- **Nivomi's own DLT registration** for OTP SMS (ADR-015).
- **Data residency.** Clerk (US) and HubSpot (outside India) hold personal data offshore. BFSI
  tenants may need India-only processing (OD-5, NFR-27). The Grafana region is chosen for CERT-In
  log residency.
- **Regulatory change:** the Third Amendment Gazette date, the CCPA AI-disclosure guidelines and
  DPDP commencement (CR-14).

## G. Cost risks

- **Unit economics are unknown.** No provider pricing was verified in this review.
  - _Mitigation:_ measure in Phase A and Phase B (PRD §13); set OD-4 afterwards.
- **LLM token cost per turn** in long calls.
  - _Mitigation:_ per-call token budgets, per-task model routing and prompt caching.
- **Grafana ingestion.**
  - _Mitigation:_ sampling, label limits, retention tiers (NFR-42).
- **Duplicate spend.**
  - _Mitigation:_ do not double-ship logs to both CloudWatch and Grafana beyond what is needed.
- **SMS cost.**
  - _Mitigation:_ Clerk sign-in without SMS; OTP only for verifying phone numbers.
- **Idle cost** from always-on voice workers.
  - _Mitigation:_ scale on concurrent calls.

## H. AI accuracy risks

- **Recognition errors.** STT errors on code-mixed speech, names, addresses, numbers, dates and
  currency over 8 kHz lines lead to wrong qualification answers.
- **Wrong appointment details.** Relative dates such as "next Saturday" can be extracted wrongly.
- **Hallucinated facts or promises.**
- **Missed escalation.**
- **Pronunciation.** TTS mispronounces Indian names and places.

**Mitigation:** a per-language evaluation set with real telephony audio, as the prompt's §4
requires (addendum §7), plus:

- deterministic qualification rules (A-13);
- spoken read-back of appointment details;
- approved-knowledge grounding;
- human correction feeding the accuracy metrics (SM-6 to SM-13).

## I. Provider risks

- **Exotel:**
  - number-series support (140xx/1601xx as `CallerId`);
  - its DLT role and the A2P declaration;
  - mid-stream transfer;
  - answering-machine detection;
  - complaint and flag feeds;
  - concurrency limits.
- **Sarvam:**
  - model churn (Saarika is being deprecated in favour of Saaras), so the STT model must be
    configuration;
  - contradictory training and retention terms, and no public DPA (VQ-5).
- **LLM:** latency and residency trade-offs, since some providers offer no India-only inference
  (research §4.3).
- **HubSpot:** API scopes and plan tiers per tenant, rate limits, and whether the Leads object and
  meeting booking are available (VQ-10).
- **Razorpay:** metered or add-on charges and GST invoicing (VQ-11).
- **MSG91:** DLT template approval time.
- **Grafana Cloud:** which services are available in the India region (VQ-14).
- **Clerk:** India SMS terms, and data held in the US (VQ-15).

## J. CRM and data-ingestion risks

- **Messy spreadsheets:** header variety, merged cells, several numbers per cell, dates in mixed
  formats.
  - _Mitigation:_ mapping, preview, validation and explicit confirmation (FR-125 to FR-127).
- **False merges** that corrupt customer data.
  - _Mitigation:_ the `REVIEW` outcome and no automatic merging of uncertain matches.
- **CRM ingestion over-fetching** personal data.
  - _Mitigation:_ field-level fetch lists.
- **Rate limits on large first syncs.**
  - _Mitigation:_ paged background jobs.
- **Webhook gaps.**
  - _Mitigation:_ scheduled incremental sync (FR-137).
- **Duplicate CRM records and activities.**
  - _Mitigation:_ External Record Links, search before create, and idempotency keys (SM-C8).
- **Field-ownership conflicts** that overwrite customer data.
  - _Mitigation:_ ownership rules and overwrite history (FR-138).
- **Disconnect and reconnect to a different portal.**
  - _Mitigation:_ explicit confirmation and no mixing of records (FR-86).

## K. Human-escalation risks

- **Transfer latency and awkwardness** (the AI leaves the line before a human answers).
  - _Mitigation:_ ringback or hold audio; context shown in the web app; measure SM-C4.
- **No human available** (outside hours, busy).
  - _Mitigation:_ bounded retry, callback and a Human Task; SM-C20 for expired callbacks.
- **Escalation storms** during a provider outage flood human teams.
  - _Mitigation:_ the `EscalationEngine` considers destination capacity; the Campaign auto-pauses
    on provider failure (FR-37).
- **Context leakage** to the wrong person.
  - _Mitigation:_ minimal context, permission-checked views (FR-134).

## L. Observability risks

- **Personal data in logs, traces and metric labels.**
  - _Mitigation:_ redaction before export and a label allowlist (NFR-40).
- **High cardinality and cost** in Grafana.
- **Gaps in per-turn latency attribution** across Exotel, Sarvam and the LLM.
  - _Mitigation:_ per-stage spans (NFR-2), with provider request IDs attached.
- **CERT-In retention** (180 days in India) against short Grafana retention.
  - _Mitigation:_ S3 archive (A-90).
- **Alert fatigue.**
  - _Mitigation:_ alerts tied to the side-effect thresholds (PRD §12) and to service-level targets,
    not raw errors.

## M. BMAD implementation plan

1. **Finish the PRD.**
   1. The owner reviews revision 2.
   2. `bmad-prd` Finalize runs: memlog audit, input reconciliation (including this prompt),
      reviewer gate, triage and polish.
   3. Commit on `docs/prd`, then open a pull request to `develop`.
2. **Research provider capabilities and pricing** with `bmad-deep-recon`, type technical, in
   "select" shape.
   - **Scope:** current capabilities, limits and **pricing** for Exotel, Sarvam (Saaras vs Saarika,
     TTS voices per language), LLM candidates, HubSpot, Razorpay, MSG91, SES and Grafana Cloud;
     calendar options (OD-1).
   - **Feeds:** OD-4, NFR-6 and the architecture.
3. **Business and legal track** (starts now, runs in parallel):
   - Exotel written answers (VQ-1, 2, 7, 8, 13);
   - Indian counsel (VQ-3, 4, 6);
   - Sarvam DPA (VQ-5);
   - Nivomi's DLT registration for OTP SMS;
   - HubSpot developer app, Razorpay account, Clerk production instance.
4. **Engineering spikes**, time-boxed and throwaway, run as `bmad-build` tasks:
   - Exotel Connect Voice AI with Sarvam streaming STT and TTS and an LLM on a real phone line:
     measure turn latency and barge-in (NFR-1 to NFR-4);
   - transfer through Connect with Flow;
   - HubSpot Meetings booking API.
5. **UX** (`bmad-ux`):
   - setup checklist;
   - Data Sources, import mapping and preview;
   - AI Agent builder and Campaign;
   - Phone Numbers and Inbound Routes;
   - call detail and the Human Agent view;
   - dashboards and Super Admin.
6. **Architecture** (`bmad-architecture`):
   - the data model;
   - ADR-008 (data access, including row-level security);
   - the queue and outbox choice;
   - the voice runtime (`ConversationEngine`, `CallStateMachine`, `EscalationEngine`);
   - the `ComplianceEngine` rule schema;
   - `UsageMeter`;
   - the `CalendarProvider` ADR;
   - the infrastructure-as-code tool;
   - the telemetry pipeline;
   - a threat model.
7. **LLM evaluation plan and evaluation set** (NFR-6).
8. **Epics and sprints:** `bmad-create-epics-and-stories`, then `bmad-sprint-planning`. Run
   `bmad-help` to check whether an implementation-readiness check is installed.
9. **Per story:** `bmad-build` or `bmad-agent-dev`, then `bmad-code-review`, then
   `bmad-retrospective` for each epic.

## N. Implementation sequence (proposed epics)

The order follows risk and dependencies. The voice spike (§M step 4) runs alongside E0 to E3.

| #   | Epic                                    | Contents                                                                                                                                                                          | Depends on   |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| E0  | Platform foundation II                  | PostgreSQL and migrations (ADR-008); local PostgreSQL and Redis; readiness check; queue and outbox; OpenTelemetry baseline; infrastructure as code; CI deploy to staging          | Architecture |
| E1  | Identity and tenancy                    | Clerk; syncing organizations and memberships; RBAC policy; MFA; audit log; tenant-isolation test harness                                                                          | E0           |
| E2  | Super Admin core                        | Organizations; encrypted provider credentials; feature flags; Plans as data; platform stop                                                                                        | E1           |
| E3  | Contact / Lead / Company domain         | Records; status engine; consent ledgers; Suppression List; External Record Links                                                                                                  | E1           |
| E4  | Data ingestion                          | `FileImportProvider`; Import Jobs; mapping; preview; deduplication; error reports; Data Sources page; file security                                                               | E3           |
| E5  | Compliance and eligibility              | `ComplianceEngine`; India Rule Set v1 (pending counsel); Telecom Identity; eligibility decisions                                                                                  | E3           |
| E6  | Voice runtime                           | `VoiceProvider` (Exotel), `STTProvider` and `TTSProvider` (Sarvam), `LLMRouter`, `ConversationEngine`, `CallStateMachine`; barge-in; fallback; recording; Transcripts; test calls | E2, spike    |
| E7  | AI Agents and conversation intelligence | Configuration and versions; tools; outcomes; qualification; AI Summaries; corrections                                                                                             | E6           |
| E8  | Outbound Campaigns                      | Static and continuous Campaigns; pacing; retries; budgets; Emergency Stop                                                                                                         | E4, E5, E7   |
| E9  | Escalation and notifications            | `EscalationEngine`; Live Transfer; callbacks; Human Tasks; SES email; MSG91 OTP; in-app notifications                                                                             | E7           |
| E10 | Inbound                                 | Phone Numbers; Inbound Routes; business hours; Voicemail                                                                                                                          | E9, OD-2     |
| E11 | Appointments                            | Nivomi Appointments; availability; `CalendarProvider` adapter                                                                                                                     | E7, OD-1     |
| E12 | HubSpot                                 | OAuth; ingestion; outbound sync; webhooks; scheduled sync; field ownership; disconnect and reconnect                                                                              | E4, E7       |
| E13 | Usage and billing                       | `UsageMeter`; Razorpay subscriptions; Included Usage and Overage; invoices; limits and alerts                                                                                     | E6, E2       |
| E14 | Analytics and observability             | Tenant dashboards; call detail; side-effect panel; the eight Grafana dashboards; alerts                                                                                           | E8 to E13    |
| E15 | Readiness                               | Load test; restore test; security review; runbooks (CERT-In 6 hours, DPDP 72 hours); the checklist below → Phase A → Phase B                                                      | All          |

## Production-readiness checklist (from the prompt's §73)

Nothing is ticked, because nothing is built. Tick each item only with evidence: a passing test, a
dashboard or a runbook.

- [ ] Multi-tenancy · [ ] RBAC · [ ] Tenant isolation (AC-2)
- [ ] Excel import · [ ] CSV import · [ ] Field mapping · [ ] Duplicate detection
- [ ] CRM connection · [ ] CRM synchronization · [ ] CRM failure recovery (AC-12)
- [ ] Inbound calls (AC-10) · [ ] Outbound calls (AC-1) · [ ] Human transfer · [ ] Callback · [ ] Escalation engine (AC-11)
- [ ] STT · [ ] TTS · [ ] Configurable LLM · [ ] Compliance engine (AC-3) · [ ] Appointment scheduling
- [ ] Transcript · [ ] AI summary · [ ] Usage metering · [ ] Billing
- [ ] Authentication · [ ] Email · [ ] OTP
- [ ] AWS infrastructure · [ ] Grafana · [ ] OpenTelemetry · [ ] CloudWatch · [ ] Dashboards · [ ] Alerts · [ ] Structured logs · [ ] Distributed tracing
- [ ] Security review · [ ] Audit logs · [ ] Provider abstractions · [ ] Automated tests · [ ] Failure recovery (AC-4, AC-13)
- [ ] Deployment process · [ ] Backups (restore tested) · [ ] Monitoring · [ ] Cost controls
