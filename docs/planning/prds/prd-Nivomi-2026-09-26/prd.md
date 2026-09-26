---
title: 'Nivomi AI — MVP Product Requirements Document'
status: draft
created: '2026-09-26'
updated: '2026-09-26'
---

# Nivomi AI — MVP Product Requirements Document

## 0. About this document

**Audience.** The product owner, who approves scope, and the owners of the next BMAD steps: UX
(`bmad-ux`), architecture (`bmad-architecture`) and epics and stories
(`bmad-create-epics-and-stories`). They read it to know **what** the MVP must do and how to tell
when it works. **How** it is built belongs in the architecture document and the ADRs; mechanism
notes collected while drafting are in [addendum.md](addendum.md).

**Sources.** This PRD builds on, and does not repeat:

- the product-owner decisions of 2026-09-26 (this PRD's brain dump);
- [product-brief.md](../../product-brief.md) and its resolved decisions;
- ADR-009 to ADR-014 in [docs/decisions/](../../../decisions/);
- the [India compliance research](../../research/domain-india-ai-outbound-calling-compliance-2026-09-25/research.md)
  (recommendations R1–R4);
- [CLAUDE.md](../../../../CLAUDE.md).

When they conflict, the owner's decisions of 2026-09-26 win. The conflicts found are listed in
§16.3.

**Revision 2 (2026-09-26).** The owner's master architecture prompt, received later the same day,
is now also a source. Where it differs from the earlier brain dump, it wins:

- inbound calls are an MVP capability (§8.17);
- a CRM is optional. An Organization can run on Excel/CSV alone, HubSpot alone, or both, and every
  source converges on Nivomi's Contact, Lead and Company records (§8.3, §8.12);
- an `EscalationEngine` with defined decisions governs human escalation (§8.10);
- email goes through Amazon SES and OTP through MSG91 (§8.18);
- application observability uses OpenTelemetry and Grafana Cloud, with CloudWatch for AWS
  infrastructure (§9.7).

The provider checks made for this revision, the full risk review and the implementation plan are
in the [architecture readiness review](../../architecture-readiness-review-2026-09-26.md).

**Tags.**

- `[ASSUMPTION A-n]` marks an inference that the owner can change without reopening scope. All
  are indexed in §18.
- `[OWNER DECISION REQUIRED OD-n]` marks a choice that materially affects scope, the business
  model, compliance or architecture. These are listed in §16.
- `[POST-MVP]` marks something the architecture must allow but the MVP does not build.
- `[VALIDATE VQ-n]` marks a fact that must be confirmed with a provider or counsel. These are
  listed in §17.

**Identifiers.** Numbering is global and stable, so later documents can cite it:

- UJ: user journeys
- FR: functional requirements
- NFR: non-functional requirements
- CR: compliance requirements
- SM: success metrics
- SM-C: side-effect and failure metrics
- RK: risks
- AC: acceptance criteria

**Where each requested topic lives:**

| Topic                       | Section               | Topic                         | Section        |
| --------------------------- | --------------------- | ----------------------------- | -------------- |
| Executive summary           | §1                    | Authentication / RBAC         | §8.1           |
| Problem statement           | §2                    | Multi-tenancy                 | §8.1, NFR §9.4 |
| Target customer             | §3.1                  | Compliance                    | §8.7, §10      |
| Product vision              | §4                    | Analytics                     | §8.14          |
| MVP scope and out-of-scope  | §7                    | Security                      | §9.5           |
| User personas               | §3.3                  | Observability                 | §9.7           |
| User journeys               | §6                    | Success metrics               | §11            |
| Functional requirements     | §8                    | Failure / side-effect metrics | §12            |
| Non-functional requirements | §9                    | Cost considerations           | §13            |
| Voice requirements          | §8.8, §8.10, NFR §9.1 | Risks                         | §14            |
| AI requirements             | §8.5, §8.9, §9.6      | Acceptance criteria           | §15            |
| CRM requirements            | §8.12                 | Open decisions                | §16            |
| Billing requirements        | §8.13                 | Assumptions                   | §18            |

## 1. Executive summary

Nivomi AI is a multi-tenant SaaS product for sales teams in India. AI voice agents call a team's
leads and hold the first, repetitive conversation in English, Hindi, Malayalam, Tamil, Telugu or
Kannada. In that conversation the agent:

- qualifies the lead against the team's own questions;
- books an appointment, or brings in a person by live transfer or scheduled callback when human
  judgement is needed;
- leaves behind a transcript, a structured outcome and a summary.

Nivomi also answers the team's inbound calls. Each result is stored in Nivomi and shown on a
manager's dashboard, and it reaches the team's own HubSpot account when one is connected. A team
can start with nothing more than an Excel file.

The MVP proves one complete journey for a real organization without technical help from Nivomi:
sign-up → configuration → HubSpot connection → AI agent → leads → campaign → compliance check →
calls → qualification → appointment or transfer → transcript and summary → HubSpot sync → usage
→ analytics (§15, AC-1). Variants prove the same for teams without a CRM, teams using only
HubSpot, inbound calls, human escalation and provider failures (AC-7 to AC-13).

Three things shape the MVP more than any feature:

1. **Indian telecom rules make compliance a product feature, not a checkbox.**
   - An AI sales call is a promotional, automated call. It must come from registered 140-series
     numbers and respect consent and preferences.
   - A few complaints can bar an organization's entire telephony for 15 days.
   - So every call passes an eligibility check backed by a rules-as-data `ComplianceEngine`, and
     campaign pacing is itself a compliance control (§8.7, §10).
2. **Voice quality and latency decide whether customers keep using it.** The conversational turn
   latency target is under 1.5–2 s, which is an engineering target, not an SLA. Barge-in,
   fallback and code-mixed Indian speech must work on real phone lines (§8.8, NFR §9.1).
3. **Tenant isolation is absolute.** This covers data, CRM accounts, telecom identities, AI
   context, files, queues and analytics. Zero cross-tenant leakage is a launch gate (NFR §9.4).

Nivomi does not replace the sales team. It **raises the team's capacity** by automating
first-level conversations and bringing people in when they are needed.

Rollout is deliberately controlled: production-grade architecture, a small design-partner cohort,
real measurement, then iteration (§7.4).

Six owner decisions remain open (§16). None blocks UX or architecture work. OD-2 (telephony
account model) and OD-3 (consent evidence) must be settled before the telephony and lead-import
epics.

## 2. Problem statement

> Sales teams have leads, but they cannot consistently and quickly follow up with every lead.

Indian SMB and mid-market sales teams generate or buy hundreds to a few thousand leads a month.
Follow-up is manual, through phone calls, spreadsheets, CRM tasks and individual representatives.
The results:

- **Slow and missed follow-up.** Leads are called late or not at all. Interest decays, and the
  legal basis for contact can lapse: TRAI's inquiry-based window is 7 days.
- **Expensive, repetitive work.** Representatives spend their time on the same qualification
  questions instead of on leads that are ready to buy.
- **Inconsistent qualification.** Every representative asks different questions and records
  answers differently, or not at all.
- **Poor visibility.** Managers cannot see call outcomes, which leads need attention, or what
  calling costs.
- **Stale CRM.** Outcomes rarely reach the CRM consistently.
- **Scaling means hiring.** Capacity grows only by adding staff.

Automating the calls creates new problems that Nivomi must also solve:

- regulatory exposure (TRAI TCCCPR, DPDP);
- voice quality in Indian languages;
- errors an AI makes with confidence;
- cost control.

## 3. Target customer and users

### 3.1 Target customer

**Ideal early customer:** an Indian SMB or mid-market sales team.

- Handles **hundreds to a few thousand leads a month**, from forms, portals, ads, walk-ins or its
  CRM.
- Has **several sales representatives** and repeats the same qualification questions.
- Follows up manually today, with delayed and missed calls as a known pain.
- May or may not use a CRM. Nivomi works from Excel/CSV alone, and **HubSpot** is the first CRM it
  connects to.

**Example segments:** real estate, education and coaching, automotive, and local
high-consideration services. Financial services and insurance are included only where legally
permitted (see OD-5). No first vertical is locked, and **the product must not be vertical-specific**:
verticals differ only in configuration (agent script, questions, status mapping, sector
compliance overlays).

### 3.2 Jobs to be done

- **Sales manager:** "When new leads arrive, get every one of them called quickly and qualified
  consistently, so my representatives spend time only on leads worth their time — and I can see
  it happening."
- **Owner or founder:** "Grow sales capacity without hiring in proportion, at a predictable cost
  per lead, without risking our phone numbers or our reputation."
- **Sales representative (Human Agent):** "Get warm, qualified leads handed to me with context,
  live or as a scheduled callback, instead of dialling cold lists."
- **Operations or admin:** "Set it up once — numbers, HubSpot, agent, compliance details — and
  trust it to stay within the rules."
- **The lead (call recipient, not a user):** "If a business calls me, make it relevant, polite,
  honest that it is AI, easy to stop, and able to get me a human."

### 3.3 Personas and roles

Every person who uses Nivomi is a Member of an Organization with exactly one Role in it. Super
Admin is a platform role held only by Nivomi staff.

| Persona (used in §6)                   | Role          | Primary needs in the MVP                                                                  |
| -------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Rahul, founder of a coaching institute | `OWNER`       | Sign-up, billing, plan, overall results, cost                                             |
| Divya, sales-operations lead           | `ADMIN`       | Members, telecom identity, HubSpot, calendar, compliance settings, retention              |
| Priya, sales manager (real estate)     | `MANAGER`     | AI agents, leads, campaigns, results, corrections, emergency stop                         |
| Arjun, sales representative            | `AGENT`       | Receives live transfers, works callbacks and appointments assigned to them                |
| Kavya, business analyst                | `ANALYST`     | Read-only analytics, call review, exports                                                 |
| An investor-relations observer         | `VIEWER`      | Read-only aggregate dashboards                                                            |
| Sameer, Nivomi operations              | `SUPER_ADMIN` | Tenant approval, telecom verification, plans, providers, rule sets, platform health, stop |
| Meena, a prospect who asked for info   | — (Lead)      | A short, honest, useful call; easy opt-out; a human on request                            |

To avoid a name clash, a Member with the `AGENT` role is called a **Human Agent** throughout, and
the configured AI is always called an **AI Agent**.

### 3.4 Non-users (v1)

- Contact centres that mainly need inbound IVR or queueing.
- Debt-collection operations.
- Teams whose main need is SMS or WhatsApp marketing.
- Teams calling bought lists that have no consent basis. The product will block these calls, by
  design.
- Enterprises that need SSO, custom roles, dedicated infrastructure or on-premises deployment.

## 4. Product vision and principles

**Vision.** Every lead gets a timely, relevant, honest first conversation in their own language.
Every salesperson spends their time where human judgement matters. Managers see what happens and
what it costs.

**MVP goal:** automate repetitive first-level sales conversations and follow-up, and bring people
into the conversation when human judgement or action is needed.

**Principles**, used to settle ambiguity downstream:

1. **Augment, don't replace.** When unsure, hand over to a person. Never bluff.
2. **Compliant by construction.** No call happens without an eligibility decision, and missing
   information blocks the call (fail closed).
3. **Honest AI.** The agent says it is AI, never claims to be human, and never invents facts,
   prices or promises.
4. **Nivomi is the system of record.** Providers and HubSpot are kept in sync, and their failure
   never loses a business outcome.
5. **Tenant isolation everywhere.** One organization's data, numbers, CRM and AI context never
   touch another's.
6. **Measured, not assumed.** Every call carries its outcome, quality signals, latency and cost.
   Side effects are tracked as closely as successes.
7. **Replaceable providers.** Telephony, speech, LLM, CRM, calendar and payment sit behind
   interfaces, and none of them leaks into product logic.
8. **Lean MVP, no dead ends.** Build the journey, and design extension points for inbound calls,
   more channels, CRMs and jurisdictions without building them.

## 5. Glossary

Every other section uses these terms exactly.

- **Organization** — A tenant: one customer company. It owns all of its data. It is linked to one
  Clerk Organization.
- **Member** — A person with access to an Organization. A person can be a Member of several
  Organizations. Each membership has one Role.
- **Role** — One of `OWNER`, `ADMIN`, `MANAGER`, `AGENT`, `ANALYST`, `VIEWER`. Nivomi decides what
  each Role may do (§8.1).
- **Super Admin** — Nivomi platform operator. It is granted only in Nivomi's database and never
  through a tenant Role.
- **Human Agent** — A Member with the `AGENT` Role. Human Agents receive Live Transfers, Scheduled
  Callbacks and Appointments.
- **Contact** — A person known to an Organization: name, phone numbers in E.164 format, email,
  preferred language and, optionally, a Company. Consent records and suppression attach to the
  Contact's phone number. A Contact can come from any Data Source.
- **Company** — A business that Contacts belong to. It is optional, used mainly by B2B tenants, and
  synced with CRM companies.
- **Lead** — A Contact in the Organization's sales lifecycle. Campaigns target Leads and the AI
  qualifies them. A Lead has one Lead Status, an owner and a call history. Calling a Lead means
  calling its Contact's phone number [ASSUMPTION A-79].
- **Data Source** — Where a record came from: `excel`, `csv`, `hubspot`, `manual`, `api`,
  `campaign`, `inbound_call` or `website`. Every Contact, Lead and Company keeps its source
  metadata.
- **Import Job** — The background processing of one uploaded file, with row counts, a status and
  an error report.
- **External Record Link** — The link between a Nivomi record and a record in an external system:
  Organization, provider, external ID, source type, last-synced time and sync state. An external ID
  is never a Nivomi primary key.
- **Field Ownership** — Which system owns each synced field: the CRM, Nivomi, or both (shared, with
  a defined conflict strategy).
- **Lead Status** — The Lead's place in the sales lifecycle (§8.4). It changes only through the
  status engine.
- **Consent Basis** — The recorded reason an Organization believes it may contact a Lead:
  `INQUIRY`, `APPLICATION`, `REGISTERED_CONSENT` or `EXISTING_CUSTOMER`. It always carries
  evidence.
- **Telecom Consent** — Consent under TRAI rules, which governs whether a commercial call may
  reach a number. It is recorded in its own ledger.
- **DPDP Consent** — Consent or another lawful basis under the DPDP Act for processing the Lead's
  personal data. It is recorded separately from Telecom Consent, and each is revoked
  independently.
- **Suppression List** — The Organization's do-not-call numbers. It is checked on every call and
  survives Lead erasure.
- **Telecom Identity** — The Organization's registered telecom sender details: DLT principal-entity
  registration, telemarketer binding, sector, Caller Numbers and A2P declaration. It must be
  verified before any call.
- **Caller Number** — A phone number that belongs to exactly one Organization. It has a series
  (140xx promotional, 1601xx or 1600xx service) and a declared purpose.
- **Phone Number** — Any number an Organization uses in Nivomi: Caller Numbers for outbound calls,
  and inbound numbers that callers dial. Every Phone Number belongs to exactly one Organization.
- **Inbound Route** — An inbound number's configuration: who answers (AI, human, or AI first then
  human), business hours, after-hours behaviour and fallback.
- **AI Agent** — A configured AI caller: persona, language, script, Qualification Questions,
  approved knowledge, escalation, appointment and call-limit settings.
- **Agent Version** — An immutable published snapshot of an AI Agent. Campaigns and Calls
  reference exactly one Agent Version.
- **Qualification Question** — A question the AI Agent must ask, with a typed answer and an
  optional qualifying rule.
- **Campaign** — A configured outbound calling effort: one Agent Version, a Lead selection, Caller
  Numbers, a schedule, pacing, a retry policy and a budget. It is either **static** (a fixed Lead
  set) or **continuous** (new matching Leads join automatically).
- **Call Attempt** — One try at calling one Lead in a Campaign. It always carries an Eligibility
  Decision and may produce one Call.
- **Call** — A telephony session with a Lead. It has a Call Disposition and, if connected, a
  Transcript, Conversation Outcome and AI Summary.
- **Eligibility Decision** — The recorded result of the eligibility check for a Call Attempt:
  `ELIGIBLE`, `BLOCKED`, `DEFERRED` or `REQUIRES_REVIEW`, with reason codes and the Rule Set
  version.
- **ComplianceEngine** — The module that evaluates the regulatory rules of a jurisdiction for the
  eligibility check.
- **Rule Set** — A versioned, per-jurisdiction set of regulatory rules held as data, with
  effective dates. India is the first.
- **Call Disposition** — The technical result of dialling: `ANSWERED`, `NO_ANSWER`, `BUSY`,
  `FAILED`, `REJECTED` or `VOICEMAIL`.
- **Conversation Outcome** — The business result of a connected Call (§8.9): the primary outcome,
  interest, Qualification Result and flags.
- **Qualification Result** — `QUALIFIED`, `NOT_QUALIFIED` or `INCOMPLETE`, computed from the
  answers to the Qualification Questions.
- **Transcript** — The speaker-labelled, timestamped text of a Call in its original language.
- **Recording** — The stored audio of a Call. It exists only when recording is enabled and
  permitted.
- **AI Summary** — A short, grounded summary of a Call, generated after the Call.
- **Handoff** — Bringing a person into the Lead's journey: either a Live Transfer or a Scheduled
  Callback.
- **Live Transfer** — Connecting the Lead, during the Call, to a Transfer Destination.
- **Scheduled Callback** — An agreed future call to the Lead, made by a Human Agent or an AI
  Agent. Its states are `REQUESTED`, `SCHEDULED`, `ASSIGNED`, `ATTEMPTED`, `COMPLETED`, `FAILED`,
  `CANCELLED` and `EXPIRED`.
- **Escalation Decision** — The `EscalationEngine`'s choice when the AI cannot or should not
  continue on its own: `CONTINUE_AI`, `TRANSFER_TO_HUMAN`, `REQUEST_CALLBACK`, `CREATE_HUMAN_TASK`
  or `END_WITH_FALLBACK`.
- **Human Task** — A to-do assigned to a Human Agent or a team, created by escalation, a failed
  transfer or a Voicemail, and synced to the CRM as a task when one is connected.
- **Voicemail** — A message an inbound caller leaves, where configured. It is stored as a
  Recording and transcribed.
- **Transfer Destination** — A configured phone target (a Human Agent or a team line) with
  business hours and languages.
- **Appointment** — A meeting between a Lead and the Organization, owned by Nivomi and synced to a
  calendar and to HubSpot.
- **CalendarProvider** — The interface through which Nivomi reads availability and writes
  Appointments to an external calendar.
- **CRM Connection** — An Organization's OAuth link to its own HubSpot account. It is optional,
  and there is at most one per Organization.
- **Sync Record** — The sync state of one Nivomi object in HubSpot: `PENDING`, `SYNCING`, `SYNCED`,
  `FAILED` or `RETRYING`.
- **Usage Event** — An append-only, idempotent record of consumption (minutes, tokens and so on)
  attributed to an Organization, Campaign and Call.
- **Plan** — A priced package: price, billing period, Included Usage, overage rate and limits.
  Plans are data.
- **Subscription** — An Organization's current Plan and its payment state.
- **Included Usage** — The consumption covered by the Subscription in a billing period.
- **Overage** — Consumption beyond Included Usage, metered and charged server-side.
- **Complaint Record** — A recorded complaint or operator spam flag against an Organization's
  calls or numbers.
- **Emergency Stop** — An immediate halt of all dialling, for one Organization or for the whole
  platform.
- **Audit Event** — An append-only record of a sensitive action: who, what, when, before and
  after.
- **Support Access Grant** — Time-bound permission, given by an Organization, for Super Admins to
  view its call content.

## 6. User journeys

UJ-1 is the MVP acceptance journey (§15, AC-1). The others cover the roles and failure paths that
UJ-1 depends on.

**UJ-1. Priya follows up this week's site-visit inquiries without dialling a single one.**

- **Persona and context.** Priya is a sales manager at a real-estate developer in Kochi. Forty web
  and portal inquiries arrived this week, and Priya's four representatives cannot reach them all
  within a day.
- **Entry state.** Priya is signed in as `MANAGER`. The Organization is `ACTIVE`, its Telecom
  Identity is verified and HubSpot is connected (UJ-2). Inquiries flow in from HubSpot and
  carry an `INQUIRY` Consent Basis.
- **Path.**
  1. Priya opens the "Site-visit qualifier" AI Agent. It speaks Malayalam and English and asks
     four Qualification Questions: budget, preferred location, timeline and home-loan need.
  2. Priya makes a test call to their own phone.
  3. Priya creates a continuous Campaign for new inquiries from the last 7 days and sets pacing
     and 3 retries.
  4. The pre-launch check shows 37 Leads eligible, 2 blocked (on the Suppression List) and 1
     deferred (outside calling hours).
  5. Priya starts the Campaign.
- **Climax.** Within minutes the calls begin:
  - Meena answers. The AI Agent introduces itself as an AI assistant calling for the developer,
    asks the four questions in Malayalam, and books a site visit for Saturday at 11:00, reading
    the time back to Meena.
  - Another Lead asks a loan-rate question outside the approved knowledge. The AI Agent says a
    colleague will answer and transfers the Lead live to Arjun (UJ-3).
- **Resolution.** By evening the dashboard shows:
  - calls attempted, connected, qualified, appointments and transfers;
  - opt-outs and compliance blocks;
  - cost per qualified Lead.

  Each Lead's HubSpot contact shows the call, the AI Summary and the meeting. Priya corrects one
  Qualification Result that the AI got wrong; the correction syncs and counts against accuracy.
  Usage appears against the plan.

- **Edge case.** HubSpot is unreachable for an hour. The calls and outcomes proceed, Sync Records
  show `RETRYING`, and everything syncs once HubSpot recovers.

**UJ-2. Rahul and Divya get from sign-up to "ready to call".**

- **Persona and context.** Rahul owns a coaching institute in Pune. Divya runs sales operations.
- **Path.**
  1. Rahul signs up, creates the Organization and becomes `OWNER`. The Organization waits for
     approval (controlled rollout).
  2. Rahul chooses a Plan and pays through Razorpay, or Nivomi assigns a pilot Plan.
  3. Rahul invites Divya as `ADMIN`.
  4. Divya records the Telecom Identity (DLT principal-entity ID, telemarketer, 140xx Caller
     Numbers, A2P declaration) and uploads evidence.
  5. Divya connects the institute's HubSpot account through OAuth, reviews the default field
     mapping, connects the calendar (OD-1), and sets Transfer Destinations with business hours.
  6. Sameer (Super Admin) verifies the Telecom Identity and approves the Organization.
- **Climax.** The setup checklist turns fully green, and campaign start is unlocked.
- **Edge case.** The 140xx numbers are not yet provisioned. Everything except starting a Campaign
  works, and the checklist states exactly what is missing.

**UJ-3. Arjun takes a warm transfer.**

- **Persona and context.** Arjun is a Human Agent and a Transfer Destination, and is in business
  hours.
- **Path.**
  1. Arjun's phone rings. The web app shows the Lead's name, the answers so far and the reason for
     the transfer.
  2. Arjun answers and continues the conversation. The AI Agent is no longer on the call.
  3. Afterwards Arjun records the result against the Lead.
- **Edge case.** Arjun does not answer. The Lead hears that nobody is free and is offered a
  callback. The Lead picks tomorrow at 10:00. A Scheduled Callback is assigned to Arjun, appears
  in "My callbacks" and becomes a HubSpot task.

**UJ-4. Meena says "don't call me again".**

Mid-call, a Lead asks not to be called again. The AI Agent confirms politely and ends the call.
Before the call ends, the number is on the Suppression List, the Lead is `DO_NOT_CALL` and the
Telecom Consent revocation is recorded. Every later Call Attempt from any Campaign in the
Organization is `BLOCKED`. The opt-out counts in the side-effect metrics.

**UJ-5. Kavya checks whether the AI is qualifying correctly.**

Kavya (`ANALYST`) filters the week's connected calls and listens to a sample of Recordings next
to their Transcripts. Kavya reviews the Qualification Results, and the dashboard shows correction
rates by AI Agent and language. Kavya exports the campaign results as CSV for the weekly review.

**UJ-6. Sameer stops a problem before the operator does.**

A tenant's Campaign receives two Complaint Records in three days. The complaint breaker pauses
all of that Organization's Campaigns automatically and alerts its Admins and Nivomi operations.
Sameer reviews the call sample (under a Support Access Grant) and finds a script that sounds
pushy. The tenant fixes the AI Agent, and Sameer lifts the pause. Every step is audited.

**UJ-7. A provider fails mid-call.**

The speech-recognition provider starts failing during a call.

- **If a fallback provider is configured:** the call continues on it.
- **If not:** the AI Agent apologises, offers a callback and ends the call cleanly.

The Call carries a provider-failure reason. The failure appears in the provider-health and
side-effect metrics. No outcome is fabricated, and the Lead is re-queued according to the retry
policy.

**UJ-8. Anand runs a first campaign from a spreadsheet, with no CRM at all.**

- **Persona and context.** Anand owns a two-wheeler dealership in Coimbatore and has no CRM. Anand
  keeps an Excel file of 1,200 walk-in and ad inquiries, with columns "Customer Name", "Mobile",
  "Model" and "Enquiry Date".
- **Path.**
  1. Anand uploads the file. Nivomi suggests mappings: "Customer Name" → full name, "Mobile" →
     phone, "Enquiry Date" → inquiry timestamp for the Consent Basis. "Model" becomes a custom
     field.
  2. The preview shows 1,150 valid rows, 30 invalid phone numbers, 20 duplicates, and 140 rows
     whose inquiry window has expired, which will be imported but not callable.
  3. Anand confirms. The import runs in the background, and Anand downloads the error report.
- **Climax.** A Tamil-speaking AI Agent calls the eligible Leads. The dashboard fills with outcomes,
  Appointments and cost, without HubSpot appearing anywhere.
- **Resolution.** Months later Anand connects HubSpot, and the existing records sync without
  duplicates (UJ-10).

**UJ-9. A parent calls the coaching institute after hours.**

- **Persona and context.** At 20:30 a parent calls the institute's inbound number. The office has
  closed. The Inbound Route says: AI answers first; after hours, offer a callback.
- **Path.**
  1. The AI Agent says it is an AI assistant and answers questions about course timings from the
     approved knowledge.
  2. It asks the qualification questions.
  3. The parent asks for a counsellor.
- **Climax.** No counsellor is available, so the AI Agent offers a callback. The parent chooses
  10:00 the next morning. A Scheduled Callback and a Human Task are assigned to Arjun.
- **Resolution.**
  - The parent now exists as a Contact and Lead with source `inbound_call`, and the call itself is
    the inquiry evidence.
  - The Transcript and AI Summary are stored, and HubSpot is updated if connected.
  - The call appears in analytics as inbound.
- **Edge case.** The AI runtime is unavailable. The route's fallback takes a Voicemail, which is
  transcribed and becomes a Human Task.

**UJ-10. Rahul combines HubSpot contacts with an education-fair spreadsheet.**

- **Persona and context.** Rahul's institute already has 10,000 contacts in HubSpot. Rahul uploads
  2,000 leads collected at an education fair.
- **Path.** Nivomi matches records by phone, email and HubSpot ID:
  - 600 fair leads update existing contacts;
  - 1,300 are created;
  - 100 go to review, for example the same phone number with a different name. They are never
    merged automatically.
- **Climax.** One Campaign targets both groups. Outcomes sync back to the matching HubSpot contacts,
  and none is duplicated.
- **Resolution.** Every record shows where it came from (HubSpot, the fair file, or both).

## 7. MVP scope

### 7.1 In scope

- **Platform:** multi-tenant Organizations, Members, the six tenant Roles plus Super Admin,
  Nivomi-owned RBAC, MFA, audit, and a Super Admin control plane (MVP subset in §8.15).
- **Telecom setup:** Telecom Identity capture and verification, and provider-independent Caller
  Numbers.
- **Data sources:** Excel (.xlsx) and CSV import with column mapping, preview and confirmation;
  ingestion from HubSpot; manual entry. All sources converge on Nivomi's Contact, Lead and Company
  records, with source metadata, deduplication, Consent Basis with evidence, the Suppression List
  and the status engine. **A CRM is optional.**
- **Inbound calls:** Phone Number management; Inbound Routes (AI, human, or AI first); business
  hours; after-hours callback and Voicemail.
- **AI voice:** outbound and inbound AI calls, AI Agent configuration and versioning, test calls, streaming
  STT and TTS, LLM through a router, conversation state, barge-in, provider fallback, AI
  disclosure, recording where permitted, Transcripts, AI Summaries, Conversation Outcomes and
  qualification.
- **Human escalation:** the `EscalationEngine`; Live Transfer (primary) with bounded retry;
  Scheduled Callback; Human Tasks.
- **Appointments:** Nivomi-owned Appointments behind a CalendarProvider. The default provider is
  OD-1.
- **Campaigns:** static and continuous Campaigns, pre-launch check, pacing, retries, budgets,
  pause/resume, Emergency Stop.
- **Compliance:** eligibility engine plus `ComplianceEngine` with the India Rule Set v1, two
  consent ledgers, complaint breaker, retention and data-rights tooling.
- **CRM (optional for each Organization):** HubSpot per-Organization OAuth; ingestion of contacts,
  companies and relevant deals; field ownership; contacts, calls, notes, deals where applicable,
  meetings and tasks; webhooks, retries, idempotency, rate limits, status, disconnect and
  reconnect.
- **Billing:** Plans as data, Razorpay subscription, Included Usage, metered Overage, limits and
  alerts, invoices, payment status and plan changes.
- **Analytics:** an operational dashboard, campaign report, call detail, quality and side-effect
  panel, CSV export, and a platform operations view.
- **Notifications:** email through Amazon SES; OTP phone verification through MSG91.
- **Observability:** OpenTelemetry instrumentation, Grafana Cloud dashboards and alerts, and
  CloudWatch for AWS infrastructure.

### 7.2 Out of scope (non-goals)

Nivomi is not building, and will not become, any of the following in the MVP:

- **A replacement for the sales team.** It does no autonomous negotiation, closing or discounting.
- **A marketing-automation or omnichannel suite.** WhatsApp, SMS, email and social automation are
  not core workflows.
  - [POST-MVP] SMS and WhatsApp confirmations and follow-ups.
- **A contact-centre suite.** Inbound calls are in the MVP (§8.17), but there are no queues,
  multi-level IVR menus, workforce management or supervisor listen-in.
  - [POST-MVP] IVR menu builder, call queueing, skills-based routing.
- **A BI platform.** It provides no data warehouse, custom report builder or predictive lead
  scoring.
- **A model or telecom company.** It builds no proprietary LLM, STT or TTS, and no custom telecom
  infrastructure.
- **A multi-provider marketplace at launch.** It supports one CRM (HubSpot) and one payment
  provider (Razorpay). Abstractions exist, but other adapters are [POST-MVP].
- **Enterprise platform features.** No SSO, custom roles, dedicated tenant infrastructure,
  multi-region deployment, Kubernetes/EKS or microservices.
- **Multi-agent AI systems.** There are no agent-to-agent orchestration or autonomous tool-using
  agents beyond the registered call tools.
- **A general workflow builder.** The brief's "workflows and follow-ups" are limited to the
  follow-ups the journey needs: retries, callbacks and appointment sync. Event-triggered custom
  automations are [POST-MVP].
- **Organization-defined Lead Statuses.** The MVP uses the default lifecycle
  [ASSUMPTION A-1]. Custom statuses are [POST-MVP].
- **A public lead-ingestion API.** This is [POST-MVP] unless OD-6 says otherwise.

### 7.3 Designed for, not built

The architecture must allow each of these later without a rewrite:

- extra channels;
- extra CRMs (Salesforce, Zoho);
- extra telephony and speech providers;
- other jurisdictions (as new Rule Sets);
- SSO;
- promotional pricing;
- per-tenant data-residency policies (see NFR-27).

### 7.4 Rollout

| Phase              | Who                                   | Gate to enter                                                    |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| A. Internal        | Nivomi's own test Organization        | AC-1 passes on staging with real Exotel/Sarvam/HubSpot sandboxes |
| B. Design partners | 3–5 Organizations [ASSUMPTION A-2]    | Launch gates AC-6 met; Super Admin approval per Organization     |
| C. Commercial      | Self-serve sign-up with approval step | Phase-B metrics reviewed (§11, §12); pricing set (OD-4)          |

The Super Admin approval step (FR-7) is an operational control, not an engineering task, so the
owner's "no manual technical intervention" criterion still holds.

## 8. Functional requirements

Every requirement below applies only within the caller's own Organization. Tenant scope is implied
and is never taken from client input (NFR §9.4).

### 8.1 Organizations, members and access control

Sign-up and sign-in use Clerk. Organization identity uses Clerk Organizations. Nivomi owns
permissions (ADR-009).

**FR-1 — Sign-up and organization creation.** A person can sign up and create an Organization,
and becomes its `OWNER`. Realizes UJ-2.

- A new Organization starts as `PENDING_APPROVAL` [ASSUMPTION A-3]. Setup actions work in that
  state; starting a Campaign does not.
- The Organization's context comes only from the verified session's active organization. An
  identifier for another Organization in a request produces "not found" and an Audit Event.

**FR-2 — Member management.** An `OWNER` or `ADMIN` can invite Members by email with a Role,
change Roles and remove Members.

- The last `OWNER` cannot be removed or demoted.
- Only an `OWNER` can grant `OWNER` or `ADMIN`.
- A removed Member loses API access within 5 minutes [ASSUMPTION A-4].

**FR-3 — Central authorization.** Every operation is checked against a central policy that
implements the matrix below and denies by default. Checks cover the API, background jobs acting
on a Member's behalf, exports and file access. No component checks Roles on its own.

**FR-4 — Multiple organizations.** A person can belong to several Organizations and switch
between them. Only the active Organization's data is visible.

**FR-5 — MFA.** Every Member can enrol in MFA.

- MFA is **enforced** for `SUPER_ADMIN`, `OWNER` and `ADMIN` [ASSUMPTION A-5].
- Enforcement is verified server-side on each session.

**FR-6 — Organization settings.** An `OWNER` or `ADMIN` can set:

- legal name, business sector and GSTIN;
- default time zone (default `Asia/Kolkata`) and default jurisdiction (default `IN`);
- default call languages;
- business hours;
- recording policy (FR-60);
- retention settings, only within Rule Set bounds (FR-121).

The sector drives the compliance overlays (CR-9).

**FR-7 — Organization lifecycle.** A Super Admin can approve, suspend, reactivate and close an
Organization.

- **Suspension** pauses all Campaigns, blocks new calls and leaves Members with read-only access.
- **Closure** starts deletion under the retention rules after a grace period of 30 days
  [ASSUMPTION A-6].
- Every lifecycle change is audited, and Members are notified.

**FR-8 — Ownership transfer.** An `OWNER` can transfer ownership to another Member, who must
accept.

**Permission matrix** [ASSUMPTION A-7] — ✓ allowed, R read-only, own = only records assigned to
the Member, — no access.

| Capability                                        | OWNER | ADMIN | MANAGER |  AGENT  | ANALYST | VIEWER |
| ------------------------------------------------- | :---: | :---: | :-----: | :-----: | :-----: | :----: |
| Plan, payment, invoices                           |   ✓   |   R   |    —    |    —    |    —    |   —    |
| Members and roles                                 |   ✓   |   ✓   |    —    |    —    |    —    |   —    |
| Telecom Identity, HubSpot, calendar, org settings |   ✓   |   ✓   |    R    |    —    |    —    |   —    |
| AI Agents (create, edit, publish, test call)      |   ✓   |   ✓   |    ✓    |    —    |    R    |   —    |
| Leads: import, edit, Suppression List             |   ✓   |   ✓   |    ✓    |   own   |    R    |   —    |
| Campaigns: create, start, pause                   |   ✓   |   ✓   |    ✓    |    —    |    R    |   —    |
| Emergency Stop (own Organization)                 |   ✓   |   ✓   |    ✓    |    —    |    —    |   —    |
| Call detail: Transcript, AI Summary               |   ✓   |   ✓   |    ✓    |   own   |    ✓    |   —    |
| Recording playback / download                     | ✓ / ✓ | ✓ / ✓ |  ✓ / —  | own / — |  ✓ / —  |   —    |
| Correct outcomes and qualification                |   ✓   |   ✓   |    ✓    |   own   |    —    |   —    |
| Handoffs, callbacks, appointments                 |   ✓   |   ✓   |    ✓    |   own   |    R    |   —    |
| Dashboards (aggregates)                           |   ✓   |   ✓   |    ✓    |   own   |    ✓    |   ✓    |
| CSV export                                        |   ✓   |   ✓   |    ✓    |    —    |    ✓    |   —    |
| Data-rights requests (export or erase a Lead)     |   ✓   |   ✓   |    —    |    —    |    —    |   —    |
| Resolve `REQUIRES_REVIEW`, Complaint Records      |   ✓   |   ✓   |    —    |    —    |    —    |   —    |
| Org audit log, Support Access Grants              |   ✓   |   ✓   |    —    |    —    |    —    |   —    |

### 8.2 Telecom identity and caller numbers

Indian rules require the calling business to be a registered sender, with declared Caller
Numbers from the right series (CR-2 to CR-4). Nivomi records and verifies these details; it does
not register the business with operators. How Caller Numbers are provisioned depends on OD-2.

**FR-9 — Telecom Identity capture.** An `ADMIN` can record the Organization's Telecom Identity and
upload evidence documents:

- DLT principal-entity registration ID;
- telemarketer binding;
- sector;
- Caller Numbers with their series and purpose;
- A2P or auto-dialer declaration covering those numbers;
- annual self-certification date.

**FR-10 — Verification.** A Super Admin reviews the Telecom Identity.

- Its states are `UNVERIFIED` → `PENDING_REVIEW` → `VERIFIED` → `EXPIRED` or `REVOKED`.
- Only `VERIFIED` allows calls. Any other state makes eligibility return `BLOCKED` with a reason
  code.

**FR-11 — Caller Numbers.** Each Caller Number belongs to exactly one Organization.

- It is stored in E.164 with its series, purpose (promotional or service), A2P declaration flag
  and status.
- Provider identifiers are kept in the adapter and never shown as product concepts.
- Assigning a number that already belongs to another Organization is rejected.

**FR-12 — Expiry.** Nivomi warns `ADMIN`s 30 days before the self-certification or a declaration
expires [ASSUMPTION A-8], and the Telecom Identity moves to `EXPIRED` on that date.

**FR-13 — Number health.** A Complaint Record or operator flag against a Caller Number pauses that
number immediately. An `ADMIN` can see each number's recent complaint and flag history.

### 8.3 Data sources, ingestion and consent evidence

Every source converges through one ingestion path, whether Excel, CSV, HubSpot, manual entry or
an inbound call. The path is: validation → mapping → deduplication → compliance checks → Nivomi's
Contact, Lead and Company records. Campaigns and every other workflow operate only on Nivomi
records and Nivomi IDs, never on live CRM objects. A CRM is optional.

**FR-14 — File import.** A `MANAGER` or above can import Contacts and Leads from `.xlsx` or `.csv`
files. The steps are:

1. upload;
2. parse;
3. detect columns and map them (FR-125);
4. preview (FR-126);
5. validate;
6. detect duplicates;
7. check compliance;
8. **explicit confirmation**;
9. import in the background (FR-127);
10. report.

Malformed data is never imported silently. Realizes UJ-8.

- The import supports partial success and produces a downloadable error report per row.
- Import history is kept.
- Limits are 20 MB and 100,000 rows per file [ASSUMPTION A-9].
- Uploaded files are scanned and type-checked.

**FR-15 — Phone normalization.** Numbers are normalized to E.164. Numbers without a country code
take the Organization's default country. Rows with invalid numbers are rejected with a reason.

**FR-16 — Consent Basis and evidence.** Every Lead carries a Consent Basis with evidence:

- the timestamp of the inquiry or consent;
- the source (form, portal, campaign, CRM);
- a reference;
- for `REGISTERED_CONSENT`, the operator consent reference.

The basis can be set per row or per import batch, with an attestation by the importing Member.
The exact evidence standard is **OD-3**. A Lead without a Consent Basis is imported but is never
callable: eligibility returns `BLOCKED` with the reason `NO_CONSENT_BASIS`.

**FR-17 — Deduplication.** Within an Organization, records are matched on normalized phone,
normalized email, external CRM ID and any unique identifier the Organization configures.

- Each incoming record gets one outcome: `CREATE`, `UPDATE`, `SKIP` or `REVIEW`.
- An uncertain match, such as the same phone with a different name, goes to `REVIEW` and is
  never merged automatically.
- Deduplication never looks across Organizations.

Realizes UJ-10.

**FR-18 — Lead record.** A Lead has:

- name, phone, email and preferred language;
- source, owner Human Agent and HubSpot ID;
- up to 50 Organization-defined typed custom fields [ASSUMPTION A-10];
- Consent Basis records, Lead Status and a timeline.

A `MANAGER` or above can add or edit a single Lead manually.

**FR-19 — Ingest from HubSpot.** When HubSpot is connected, an `ADMIN` or `MANAGER` can ingest
contacts from a HubSpot list or segment, with their companies and, where relevant, deals.

- Nivomi fetches only the fields it needs and never copies the whole CRM.
- HubSpot records pass the same validation, mapping, deduplication and compliance checks as files.
- CRM data is never assumed to be callable.
  A mapped HubSpot property supplies the Consent Basis; contacts without it import as
  not callable.

New contacts that join configured lists arrive through webhooks (FR-94) and can feed a continuous
Campaign (FR-35). This is the main path for fast follow-up.

**FR-20 — Lead list.** Leads can be searched and filtered by status, Campaign, Conversation
Outcome, consent validity and owner. Results are paginated.

**FR-21 — Lead timeline.** Each Lead has a chronological timeline of:

- Call Attempts and Eligibility Decisions;
- Calls;
- status changes and consent changes;
- Handoffs and Appointments;
- corrections;
- Sync Records.

**FR-22 — Suppression List.** Numbers join the Suppression List:

- manually;
- by import;
- through an in-call opt-out (FR-51);
- through a HubSpot signal (FR-94).

When sources disagree, the most restrictive one wins. When a Lead is erased (FR-123), a
one-way hash of its number stays on the Suppression List so the opt-out is still honoured.

**FR-125 — Column detection and mapping.** Nivomi reads the header row and suggests a mapping from
each column to a Nivomi field, using known synonyms. For example:

- "Name", "Full Name", "Customer Name" and "Lead Name" map to full name;
- "Phone", "Mobile" and "Contact Number" map to phone.

Supported fields:

- first name, last name, full name;
- phone, email;
- company, job title;
- source, lead status, lead score;
- city, state, country;
- preferred language, consent status, preferred call time;
- external ID;
- custom fields.

The Member confirms or changes every mapping, and mappings can be saved for reuse. An unmapped
column is ignored, never guessed. A lead-score column is stored as data only, because predictive
scoring is out of scope.

**FR-126 — Import preview.** Before anything is imported, the preview shows:

- total, valid, invalid and duplicate rows;
- rows missing required fields;
- rows with compliance issues: no Consent Basis, suppressed, or an expired inquiry window.

Nothing is imported until the Member explicitly confirms.

**FR-127 — Import Job tracking.** Each Import Job records:

- the Organization and file name;
- total, processed, successful, failed and duplicate rows;
- timestamps and status.

Progress is visible while it runs. One invalid row does not fail the import. When it finishes, a
downloadable error report lists each failed row and the reason.

**FR-128 — Uploaded-file security.** Uploaded files:

- go directly to encrypted storage in India, through signed upload URLs that expire after 15
  minutes [ASSUMPTION A-94];
- are validated for type, size and structure before parsing;
- are readable only by the Organization's permitted Members;
- are deleted automatically 30 days after the import completes [ASSUMPTION A-93].

Every access is audited.

**FR-129 — Source metadata and External Record Links.** Every Contact, Lead and Company records
its Data Sources and its import or sync reference.

- A record from an external system keeps an External Record Link.
- An external ID is never used as a Nivomi primary key.
- A record found in several sources keeps every link. Realizes UJ-10.

**FR-130 — Manual records.** A `MANAGER` or above can create and edit Contacts, Leads and
Companies by hand. Manual records use the same model, validation, deduplication and compliance
checks as imported ones. There is no separate model for manual data.

**FR-131 — Data Sources page.** An `ADMIN` or `MANAGER` has one page with five parts:

- **Import Data:** upload a file.
- **Connect CRM.**
- **Connected Sources:** source, status, record count, last sync, errors, and disconnect or
  reconnect.
- **Import History:** file, rows, successes, failures, duplicates, date and status.
- **CRM Sync:** last sync, status, records synced, errors and retry.

### 8.4 Lead status engine

**FR-23 — Default lifecycle.** The statuses are those in the product brief:

- `NEW`, `CONTACTED`, `ATTEMPTED`, `CONNECTED`;
- `INTERESTED`, `QUALIFIED`, `CALLBACK_REQUESTED`, `FOLLOW_UP`, `APPOINTMENT_BOOKED`, `CONVERTED`;
- `NOT_INTERESTED`, `UNREACHABLE`, `DO_NOT_CALL`, `CLOSED`.

The default mapping from Conversation Outcome to Lead Status is in the addendum.

**FR-24 — Recorded, idempotent transitions.** Every status change records:

- the old and new status;
- the source: AI Call, Member, import, HubSpot or system;
- the actor, reason and triggering event.

Processing the same triggering event twice produces one transition.

**FR-25 — Precedence.**

- `DO_NOT_CALL` blocks all calls.
- `CONVERTED` and `CLOSED` Leads are excluded from Campaigns by default.
- A Member's manual change is never overwritten by an AI Conversation Outcome that is older
  than the change [ASSUMPTION A-11].

### 8.5 AI Agent configuration

**FR-26 — Create an AI Agent.** A `MANAGER` or above can create an AI Agent with:

- an internal name and the persona name it introduces itself with;
- the company name it speaks;
- a primary language and the other allowed languages;
- a voice chosen from those available for each language;
- a purpose statement;
- a **call category** (promotional or service), which eligibility uses (CR-1).

**FR-27 — Conversation script.** The AI Agent's script has:

- **Opening.** The platform inserts, and the tenant can extend but not remove:
  - the AI disclosure;
  - the identity of the calling business;
  - the purpose of the call;
  - the recording notice, when recording is on.
- **Qualification Questions.** They are ordered. Each has a typed answer (yes/no, single choice,
  number, range, date, free text), a required flag and an optional qualifying rule.
- **Approved knowledge.** Facts and FAQ entries the AI Agent may state, up to about 20,000
  characters [ASSUMPTION A-12]. The MVP has no document retrieval.
- **Objection guidance.**
- **Closing.**

**FR-28 — Deterministic qualification.** The Qualification Result is computed by rules over the
captured answers, for example "budget ≥ ₹60 L AND timeline ≤ 6 months". It is not a free LLM
judgement [ASSUMPTION A-13].

**FR-29 — Escalation settings.** A `MANAGER` or above chooses which conditions trigger a Handoff
(FR-73) and where it goes. An explicit request for a human is always a trigger and cannot be
disabled.

**FR-30 — Appointment settings.** A `MANAGER` or above sets whether booking is enabled, the
Appointment type, duration, minimum lead time and horizon, and the availability source (FR-80).

**FR-31 — Call limits.** Each AI Agent has:

- a maximum call duration (default 5 minutes) [ASSUMPTION A-14];
- a silence timeout;
- a maximum number of re-prompts;
- end-call conditions.

**FR-32 — Versioning.** Publishing creates an immutable Agent Version.

- A Campaign is pinned to one Agent Version and moves to a new one only when a `MANAGER` or above
  switches it.
- Every Call records the Agent Version it used.

**FR-33 — Test calls.** A `MANAGER` or above can place a test call from the AI Agent to their own
phone number, in any configured language.

- Test calls go only to phone numbers that a Member has verified as their own.
- They are marked as tests and excluded from analytics.
- They are metered as usage [ASSUMPTION A-15].

**FR-34 — Platform guardrails.** Safety instructions are platform-owned and no tenant setting can
override them. The AI Agent:

- never claims to be human;
- does not state prices, discounts or commitments that are not in the approved knowledge;
- never asks for OTPs, passwords, card or bank details, or Aadhaar numbers [ASSUMPTION A-16];
- does not argue after a refusal;
- is not steered by instructions spoken by the caller (see FR-63).

### 8.6 Campaigns

**FR-35 — Create a Campaign.** A `MANAGER` or above can create a Campaign with:

- one Agent Version;
- a Lead selection: filter, list or import batch;
- the type: static, or continuous, where new matching Leads join automatically
  [ASSUMPTION A-17];
- Caller Numbers matching the call category;
- a schedule: date range and daily windows, which may only be narrower than the Rule Set allows;
- pacing: maximum concurrent calls and calls per hour;
- a retry policy;
- a budget cap in minutes;
- an end date.

**FR-36 — Pre-launch check.** Before a Campaign starts, a dry run of eligibility over the
selection shows how many Leads are eligible, blocked (by reason), deferred or need review. A
Campaign with zero eligible Leads cannot start.

**FR-37 — Lifecycle.** A Campaign moves through `DRAFT` → `SCHEDULED` → `RUNNING` ⇄ `PAUSED` →
`COMPLETED`, `CANCELLED` or `STOPPED`.

It is paused automatically, with a stated reason, when:

- the budget or usage cap is reached;
- the complaint breaker trips;
- the Telecom Identity becomes invalid;
- billing is past due;
- a provider is unavailable.

**FR-38 — Durable execution.** Campaigns run in the background and can be resumed. A worker
crash, deploy or restart never loses a Call Attempt and never makes a duplicate call. Each Call
Attempt is idempotent on (Campaign, Lead, attempt number).

**FR-39 — Re-check at dial time.** Eligibility is evaluated again immediately before every dial,
not only at launch.

**FR-40 — Retries.** Retries follow the retry policy.

- **Defaults:** at most 3 attempts per Lead per Campaign, at least 4 hours apart, at most 2
  attempts per Lead per day [ASSUMPTION A-18].
- `NO_ANSWER`, `BUSY`, `FAILED` and provider-failure dispositions are retried.
- `OPTED_OUT`, `NOT_INTERESTED` and `WRONG_NUMBER` never are.
- A requested callback time replaces the retry schedule.

**FR-41 — One conversation at a time.** A Lead never has two concurrent calls, across all
Campaigns. At most one connected sales call per Lead per day is allowed across the Organization's
Campaigns [ASSUMPTION A-19].

**FR-42 — Progress.** A running Campaign shows:

- live calls;
- counts per state;
- eligibility blocks by reason;
- budget used;
- remaining Leads.

**FR-43 — Emergency Stop.** An `OWNER`, `ADMIN` or `MANAGER` can stop all dialling for the
Organization, and a Super Admin can stop one Organization or the whole platform.

- New dialling stops within 30 seconds [ASSUMPTION A-20].
- Calls in progress close gracefully, with a short apology, within 60 seconds.
- Resuming is an explicit action and is audited.

### 8.7 Eligibility and ComplianceEngine

Every outbound call is gated. Regulatory content lives in Rule Sets (data) that the
`ComplianceEngine` evaluates. None of it is hard-coded in Campaign or voice logic (ADR-014). The
regulatory content is in §10.

**FR-44 — Mandatory gate.** Every Call Attempt passes eligibility before dialling, including
retries, Scheduled Callbacks by the AI Agent and continuous-Campaign entries.

- The result is `ELIGIBLE`, `BLOCKED`, `DEFERRED` or `REQUIRES_REVIEW`, with machine-readable
  reason codes.
- No code path dials without an `ELIGIBLE` decision. Test calls to a Member's own verified number
  (FR-33) use a separate, audited rule.

**FR-45 — Checks.** Eligibility evaluates at least:

- Organization state and Subscription entitlement;
- Telecom Identity state;
- whether the Caller Number's series fits the call category;
- the A2P declaration;
- Consent Basis validity, including the inquiry-window expiry;
- Telecom Consent and DPDP Consent;
- the Suppression List;
- preference-registry (NCPR/DND) status and categories;
- recipient-local time bands;
- the 90-day re-consent block;
- attempts, cooldown and the daily cap;
- Lead Status;
- Campaign budget and Organization usage cap;
- complaint-breaker state;
- whether the jurisdiction can be resolved.

**FR-46 — Rules as data.** Rule Sets are versioned per jurisdiction and carry effective dates.
Organization settings may only tighten them. Any change to a regulatory rule is a new Rule Set
version, never a code change.

**FR-47 — Fail closed.** None of the following ever yields `ELIGIBLE`:

- an unknown jurisdiction;
- a missing rule;
- an unavailable preference-registry check;
- an unclassified call category;
- ambiguous consent.

These yield `DEFERRED` (for transient failures) or `REQUIRES_REVIEW`.

**FR-48 — Decision record.** Each Eligibility Decision stores:

- the Lead, Organization, Campaign and Rule Set version;
- a snapshot of the inputs;
- the result, reasons and time.

It appears on the Lead timeline and is kept according to the retention matrix.

**FR-49 — Complaint breaker.** An `ADMIN` or a Super Admin records Complaint Records and operator
spam flags. A provider feed can also create them, if one exists (VQ-7).

The breaker **pauses all of the Organization's Campaigns**:

- at 2 complaints within a rolling 10 days [ASSUMPTION A-21], well below TRAI's thresholds;
- immediately on any operator flag on its numbers.

Resuming needs acknowledgement from an `ADMIN` and approval from a Super Admin [ASSUMPTION A-22].

**FR-50 — Review queue.** An `ADMIN` resolves `REQUIRES_REVIEW` decisions, for example by
supplying evidence or confirming a jurisdiction. Each resolution is audited. A review can never
override a `BLOCKED` rule.

**FR-51 — In-call opt-out.** When a Lead asks not to be called:

- the number joins the Suppression List before the Call ends;
- the Lead becomes `DO_NOT_CALL`;
- the Telecom Consent revocation is recorded;
- the 90-day re-consent block starts.

A request to stop _processing_ their data is a separate data-rights request (FR-123), because
telecom and DPDP revocation are independent. Realizes UJ-4.

**FR-52 — Two consent ledgers.** Telecom Consent and DPDP Consent are recorded in separate,
append-only ledgers. Each entry has a source, evidence, validity dates and a revocation. Neither
ledger is ever collapsed into a single "consented" flag.

### 8.8 Live AI calls (voice)

**FR-53 — Place the call.** The platform places an outbound call from one of the Organization's
Caller Numbers through `VoiceProvider`.

- The Call record exists before dialling, with an idempotency key.
- Every Call ends with a Call Disposition.

**FR-54 — Prompt opening.** Once the Lead answers, the AI Agent starts the opening (FR-27) within
1 second [ASSUMPTION A-23]. Silent or abandoned connected calls are a regulatory and spam-flag
risk.

**FR-55 — Streaming conversation.** Audio streams through streaming STT, then the LLM, then
streaming TTS. Latency targets are in NFR-1 to NFR-4.

**FR-56 — Barge-in.** When the Lead starts speaking, playback stops within 300 ms
[ASSUMPTION A-24], in-flight generation is cancelled and the AI Agent responds to the new input.

**FR-57 — Languages.** The AI Agent speaks the Lead's preferred language if it is set and allowed,
and otherwise the AI Agent's primary language.

- If the Lead replies in another allowed language, the AI Agent may switch [ASSUMPTION A-25].
- Code-mixed speech, such as Hindi–English or Malayalam–English, must be understood (VQ-9).
- If the Lead's language is unsupported, the AI Agent ends politely with the outcome
  `LANGUAGE_UNSUPPORTED`.

**FR-58 — Conversation state.** The AI Agent tracks:

- questions asked and answered;
- captured entities;
- turn history;
- actions taken.

Transient provider errors within a turn do not lose this state.

**FR-59 — Provider fallback.** If STT, TTS or the LLM fails mid-call, the platform switches to the
next configured fallback provider. If none is available, the AI Agent apologises, offers or
schedules a callback and ends the Call. The Call records the failure reason. Realizes UJ-7.

**FR-60 — Recording.** Calls are recorded only when:

- the Organization has enabled recording;
- the Organization has approved the notice wording;
- the Rule Set permits recording.

Recording is **off** by default [ASSUMPTION A-26]. Recordings are:

- encrypted and stored in India;
- played back and downloaded according to the permission matrix;
- deleted according to the retention matrix.

**FR-61 — Conversation limits.** Maximum duration, silence handling and repetition or loop
detection are enforced, along with a per-call LLM token budget. Reaching a limit ends the call
gracefully, with a reason.

**FR-62 — Answering machines.** When voicemail is detected, the AI Agent ends the call without
leaving a message, and the Call Disposition is `VOICEMAIL` [ASSUMPTION A-27; VALIDATE VQ-8].

**FR-63 — Resistance to manipulation.** Nothing the caller says can:

- change the AI Agent's instructions;
- reveal its configuration or prompts;
- trigger tools outside the AI Agent's scope;
- make it claim to be human.

**FR-64 — Registered call tools.** During a Call the AI Agent can act only through registered,
tenant-scoped tools, each with a schema, authorization, audit, timeout and rate limit:

- read the Lead's context;
- record an answer;
- set an outcome;
- propose or book an Appointment;
- request a transfer;
- schedule a callback;
- record an opt-out;
- end the call.

It has no other access.

### 8.9 Conversation intelligence: transcripts, outcomes, summaries

**FR-65 — Transcript.** Every connected Call has a complete Transcript with speaker labels and
timestamps, in the original language. It is available within 2 minutes of the Call ending at p95
[ASSUMPTION A-28].

**FR-66 — Qualification capture.** Each Qualification Question has:

- a structured answer;
- a confidence;
- the Transcript excerpt that supports it.

Questions that were not asked or not answered are marked as such.

**FR-67 — Conversation Outcome.** Every connected Call has exactly one primary outcome:

- `INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`;
- `APPOINTMENT_BOOKED`, `TRANSFERRED`, `TRANSFER_FAILED`;
- `OPTED_OUT`, `WRONG_NUMBER`, `LANGUAGE_UNSUPPORTED`;
- `INCOMPLETE` (the call dropped or hit a limit).

It also has an interest level, a Qualification Result, and flags: complaint risk, human requested
and low confidence.

**FR-68 — AI Summary.** Each connected Call gets an AI Summary of at most 150 words
[ASSUMPTION A-29], written in English regardless of the call language [ASSUMPTION A-30]. It
covers the Lead's need, the answers, objections and the agreed next step.

- It is **grounded**: it contains only information present in the Transcript and Lead record.
- It is generated in the background after the Call.

**FR-69 — Entity extraction.** Appointment and callback times, and the answers to the
Qualification Questions, are extracted as typed values, normalized to the Lead's time zone and
validated.

**FR-70 — Status update.** A Conversation Outcome updates the Lead Status through the status
engine, using the default mapping.

**FR-71 — Human correction.** A `MANAGER` or above can correct a Call's outcome, Qualification
Result, answers or AI Summary. A Human Agent can correct Calls they own.

- The original is kept.
- The correction propagates to the Lead Status and to HubSpot.
- Corrections feed the accuracy metrics (SM-6 to SM-9). Realizes UJ-5.

**FR-72 — Review queue.** Calls with low confidence, a complaint-risk flag or a failed transfer are
queued for human review [ASSUMPTION A-31].

### 8.10 Human escalation and handoff

An `EscalationEngine` decides what happens whenever the AI cannot, or should not, continue on its
own. An AI failure is never treated as a call failure: it leads to a controlled recovery. Live
Transfer is the primary mechanism, and Scheduled Callback and Human Tasks are the fallbacks.

The provider's public documentation currently describes transfer only **after** the AI's audio
stream ends (see the addendum and VQ-2). The MVP therefore treats a Live Transfer as a one-way
exit: the AI Agent hands over and leaves, and the Lead is not returned to the AI Agent.

**FR-73 — Transfer Destinations.** An `ADMIN` or `MANAGER` defines Transfer Destinations, each
with a phone number, an optional Human Agent, business hours and languages. A destination can be
assigned to the Organization, an AI Agent or a Campaign; the most specific assignment wins.

**FR-74 — Escalation triggers.** A Handoff starts when any of these occurs:

- the Lead asks for a human (always);
- a question falls outside the approved knowledge;
- confidence stays low after 2 attempts to clarify [ASSUMPTION A-32];
- the conversation reaches a configured topic;
- a compliance or policy condition occurs, such as distress, a complaint or an apparent minor;
- the Lead's answers meet a configured high-value rule, for example a budget above a threshold;
- the AI misunderstands repeatedly: the same question re-asked twice without a usable answer;
- an STT, LLM or TTS failure that fallback cannot absorb (FR-59, FR-133);
- an Appointment cannot be booked (FR-135);
- an action the Lead asked for fails, including a CRM-related action.

**FR-75 — Live Transfer.**

1. The AI Agent tells the Lead it is connecting them.
2. The Call is connected to the Transfer Destination. The Lead hears ringback or a hold prompt,
   never silence.
3. The Human Agent sees the Lead, the answers so far and the transfer reason in the web app. A
   spoken whisper is added if the provider supports it [ASSUMPTION A-33].

Realizes UJ-3.

**FR-76 — Transfer failure.** If the destination is busy, does not answer within 25 seconds
[ASSUMPTION A-34], or is outside its business hours:

1. **Bounded retry:** the next Transfer Destination in the configured order is tried, up to 2
   destinations in total [ASSUMPTION A-80].
2. If none answers, the Lead hears a configured message, and a Scheduled Callback is offered and
   recorded.
3. A Human Task is created for the destination's owner, and the CRM is updated when one is
   connected.
4. The outcome is `TRANSFER_FAILED`.

The Lead is never silently disconnected.

**FR-77 — Scheduled Callback.** A Lead can agree a callback time within the allowed calling
windows. The callback is assigned either to a Human Agent or to the AI Agent, according to the
AI Agent's setting.

- **Human callbacks** appear in "My callbacks" and sync to HubSpot as tasks. The Human Agent
  calls outside Nivomi (there is no softphone in the MVP [ASSUMPTION A-35]) and records the
  result.
- **AI callbacks** are Call Attempts and pass eligibility at the time they run.

A callback moves through `REQUESTED` → `SCHEDULED` → `ASSIGNED` → `ATTEMPTED` → `COMPLETED`. It
can instead end as `FAILED`, `CANCELLED` or `EXPIRED`; a callback expires when nobody works it
within 24 hours of the agreed time [ASSUMPTION A-81]. The assignee is notified when the callback is
assigned and again when it is due (FR-148).

**FR-78 — Handoff timeline.** These events are recorded on the Call and Lead timelines, with
timestamps:

- transfer requested, initiated, answered and failed;
- callback scheduled, completed and missed.

**FR-132 — EscalationEngine.** Every escalation trigger (FR-74) and every failure that cannot be
recovered goes to the `EscalationEngine`. It returns one Escalation Decision:

- `CONTINUE_AI`, for example after a successful clarification;
- `TRANSFER_TO_HUMAN`;
- `REQUEST_CALLBACK`;
- `CREATE_HUMAN_TASK`;
- `END_WITH_FALLBACK`: a polite close that states the next step.

Decisions follow the configured policy of the Organization, AI Agent, Campaign or Inbound Route.
They take account of which destinations are available and their business hours. Each decision is
recorded on the Call timeline with its trigger. The policy is data, not code.

**FR-133 — Controlled recovery.** No provider failure ends a Call without a spoken next step. The
order is: retry where safe → configured fallback → escalation.

- **STT:** retry, then the fallback provider, then a human or a callback.
- **LLM:** timeout, bounded retry, then a validated fallback model, then a human or a callback.
- **TTS:** retry, then the fallback provider, then a human or a callback. If no TTS works, the
  telephony provider plays a pre-recorded message [ASSUMPTION A-82].

Every recovery produces an Audit Event and a metric, and an alert above a threshold. Realizes UJ-7.

**FR-134 — Human Tasks.** A Human Task has:

- an assignee: a Human Agent or a team;
- the Lead;
- a reason and a due time;
- a status: `OPEN`, `DONE` or `CANCELLED`;
- context: the AI Summary so far, the qualification answers and the requested action.

Context carries no more personal data than the task needs. Tasks appear in the Human Agent view
(FR-111) and sync to the CRM as tasks when one is connected.

### 8.11 Appointments

**FR-79 — Nivomi-owned Appointment.** An Appointment has:

- the Lead, a type and a mode (visit, phone or video);
- start and end time, and time zone;
- the assigned Human Agent or resource;
- the source Call;
- a status: `PROPOSED`, `BOOKED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED` or `NO_SHOW`.

**FR-80 — Availability.** The AI Agent offers slots from the connected CalendarProvider (the
default provider is **OD-1**). Without a connected calendar, it uses availability windows kept in
Nivomi for each Human Agent or resource [ASSUMPTION A-36].

**FR-81 — Booking.** The AI Agent offers at most 3 slots, confirms the chosen slot by reading back
the date and time in the Lead's language, and books it.

- A held slot cannot be double-booked.
- The spoken confirmation matches the stored Appointment exactly.

**FR-82 — Appointment sync.** Appointments sync to the CalendarProvider and to HubSpot as
meetings. A sync failure never cancels an Appointment; it shows as a Sync Record state and alerts
the `ADMIN`.

**FR-83 — Changes.** A `MANAGER` or the assigned Human Agent can reschedule, cancel or complete an
Appointment, or mark it `NO_SHOW`. Every change syncs.

Confirmations by SMS or WhatsApp are [POST-MVP]. A calendar invitation is sent to the Lead only
when the provider supports it and the Lead's email is known [ASSUMPTION A-37].

**FR-135 — No false confirmation.** The AI Agent confirms an Appointment to the Lead only after two
things are true: the Appointment is committed in Nivomi, and the availability source has confirmed
the slot is free.

If availability lookup or booking fails, the AI Agent says so and never states a booked time.
The `EscalationEngine` then offers a callback or creates a Human Task.

### 8.12 CRM integration (HubSpot, optional for each Organization)

The HubSpot integration is part of the MVP, but connecting a CRM is optional for each
Organization: Nivomi works fully from Excel, CSV and manual data. An Organization that connects
HubSpot connects its **own** account, and there is never a shared account. HubSpot is reached through `CRMProvider` and its HubSpot adapter.
Nivomi is authoritative for its own data (ADR-012).

**FR-84 — Connect.** An `OWNER` or `ADMIN` connects HubSpot through OAuth.

- An Organization has one CRM Connection [ASSUMPTION A-38].
- A HubSpot account already connected to another Organization is rejected
  [ASSUMPTION A-39].
- Tokens are encrypted, never shown in the browser and never written to logs.

**FR-85 — Connection status.** A CRM Connection is `CONNECTED`, `DEGRADED`, `TOKEN_INVALID` or
`DISCONNECTED`.

- Its health is checked regularly.
- `ADMIN`s are alerted on any state other than `CONNECTED`.

**FR-86 — Disconnect and reconnect.** Disconnecting stops sync and revokes the tokens.

- Nivomi keeps every Contact, Lead and Company it holds, and deletes nothing.
- Those records show "Source: HubSpot · Disconnected · last synced <time>".

- Reconnecting the same HubSpot account matches existing records by their External Record Links,
  creates no duplicates, resumes sync and replays the pending backlog.
- Connecting a different account requires explicit confirmation and resets the mappings. Records
  from the two accounts are never mixed.

**FR-87 — Field mapping.** An `ADMIN` maps Nivomi fields (Lead Status, Conversation Outcome,
qualification answers, Consent Basis, custom fields) to HubSpot properties, starting from
defaults.

**FR-88 — Contact sync.** A Lead corresponds to a HubSpot contact. Matching uses the HubSpot ID,
then phone, then email, and Nivomi searches before creating anything, so no duplicate contacts are
created. Lead Status and qualification sync to the mapped properties.

HubSpot's separate "Leads" object is [POST-MVP] until its API is verified [ASSUMPTION A-40].

**FR-89 — Call activity.** Every connected Call is logged on the contact as a call activity with:

- time, duration and Call Disposition;
- the Conversation Outcome;
- a link to the Call in Nivomi, which requires sign-in. It is never a public recording URL.

Attempts that did not connect are summarized on the Lead, not logged one by one
[ASSUMPTION A-41].

**FR-90 — Notes.** The AI Summary and the qualification answers are written as a note on the
contact.

**FR-91 — Deals where applicable.** When an Organization turns this on, a `QUALIFIED` or
`APPOINTMENT_BOOKED` outcome creates or updates one deal per Lead and Campaign in the configured
pipeline and stage. The deal is never duplicated.

**FR-92 — Meetings and tasks.** Appointments sync as meetings, and Scheduled Callbacks for Human
Agents sync as tasks.

**FR-93 — Idempotent, rate-aware background sync.** Sync is driven by domain events.

- Each write is idempotent per event and target object.
- Retries use backoff and respect HubSpot's rate limits.
- Writes still failing after 24 hours go to a dead-letter queue [ASSUMPTION A-42].
- Each object has a Sync Record. An `ADMIN` can see failures and retry them.

**FR-94 — Inbound webhooks.** Signed HubSpot webhooks are verified and mapped to the owning
Organization by HubSpot account ID. They are deduplicated and applied through the same domain
services as any other source. They cover:

- contact changes (name, email, phone, owner);
- do-not-call or unsubscribe signals, where the most restrictive signal wins;
- new contacts in configured lists, which feed continuous Campaigns.

**FR-95 — Failure isolation.** A HubSpot outage, revoked token or rate limit never blocks calls,
outcomes or Appointments. It appears only as sync state and an alert.

**FR-136 — CRM optional.** Only CRM sync requires a CRM Connection; everything else works without
one. Campaigns, AI Agents, calls, Appointments, analytics and billing behave identically for an
Organization that has never connected HubSpot. Campaign and voice logic never depends on HubSpot
objects; it uses Nivomi IDs. Realizes UJ-8.

**FR-137 — Scheduled sync.** Where webhooks do not cover a change, an incremental sync fetches
changes since the last cursor every 15 minutes [ASSUMPTION A-83]. Upserts are idempotent.

**FR-138 — Field Ownership.** Every mapped field has one of three owners:

- **CRM-owned**, for example lifecycle stage and company details;
- **Nivomi-owned**: AI qualification, Conversation Outcome, AI Summary, Campaign state and the
  consent ledgers;
- **Shared**, with a configured conflict strategy. The default is that the most recent change wins
  and the overwritten value is kept in history [ASSUMPTION A-84].

Rules that always apply:

- Nivomi never writes a CRM-owned field.
- Inbound sync never overwrites a Nivomi-owned field.
- No customer data is overwritten silently: every overwrite is recorded.

### 8.13 Usage metering and billing

The model is subscription + Included Usage + metered Overage. Razorpay is reached through
`PaymentProvider`, and Nivomi owns the billing domain (ADR-013). **No prices are set in this
PRD** (OD-4).

**FR-96 — Plans as data.** A Super Admin defines Plans:

- price and billing period;
- Included Usage;
- overage rate;
- limits: concurrent calls, AI Agents, seats and Campaigns;
- feature flags.

Plans are versioned. A change never alters an active Subscription's terms mid-period.

**FR-97 — Subscription.** An `OWNER` chooses a Plan and pays through Razorpay.

- Subscription states are `PILOT`, `ACTIVE`, `PAST_DUE` and `CANCELLED`.
- A Super Admin can assign a pilot Plan without payment (design partners).

**FR-98 — Usage metering.** Every source of cost emits Usage Events:

- connected call minutes;
- telephony minutes;
- STT audio seconds and TTS characters;
- LLM tokens, per task;
- recording storage;
- CRM operations.

Usage Events are append-only and idempotent per source event. They are attributed to the
Organization, Campaign, Call and AI Agent. The **billable unit and its rounding** are part of
OD-4. Until then the assumed unit is connected minutes, rounded up per Call to the next minute
[ASSUMPTION A-43].

**FR-99 — Included Usage and Overage.** Consumption is tracked per billing period and Overage is
computed server-side. It is charged through Razorpay by the mechanism confirmed in VQ-11.

**FR-100 — Limits and alerts.**

- `OWNER`s and `ADMIN`s are alerted at 80% and 100% of Included Usage [ASSUMPTION A-44].
- An `OWNER` sets a monthly Overage cap. Reaching it pauses Campaigns, and eligibility returns
  `BLOCKED` for the budget.

**FR-101 — Invoices.** An invoice per period shows the subscription and Overage lines with GST
details, and the `OWNER` can download it [ASSUMPTION A-45; VALIDATE VQ-11].

**FR-102 — Payment status and entitlement.** When a payment fails, the Subscription moves to
`PAST_DUE`.

- After a 7-day grace period [ASSUMPTION A-46], Campaigns pause.
- Data and read access stay; nothing is deleted for non-payment during retention.

**FR-103 — Plan changes.** An upgrade takes effect immediately, prorated. A downgrade takes effect
at the end of the period [ASSUMPTION A-47]. Promotional codes and discounts are supported by the
data model; the interface for them is [POST-MVP].

**FR-104 — Reconciliation.** Razorpay webhooks are signature-verified and idempotent. Nivomi's
records are reconciled with Razorpay's daily [ASSUMPTION A-48], and mismatches alert Nivomi
operations.

**FR-105 — Usage visibility.** An `OWNER` or `ADMIN` sees usage against Included Usage, projected
Overage, and usage by Campaign and AI Agent.

### 8.14 Analytics and operational dashboard

The dashboard is useful and operational, not a BI platform.

**FR-106 — Dashboard.** It filters by date range, Campaign and AI Agent, and shows:

- **Campaigns and calls:** Campaigns, calls attempted, calls connected and connection rate.
- **Outcomes:** Conversation Outcomes; interested, not-interested and qualified Leads.
- **Results:** Appointments, transfers (successful and failed), failed calls.
- **Usage and cost:** usage and billed-cost visibility.
- **CRM:** CRM sync status.

**Data freshness:** call counts within 60 seconds; aggregates within 5 minutes
[ASSUMPTION A-49].

**FR-107 — Campaign report.** Each Campaign shows:

- the funnel: Leads → eligible → attempted → connected → conversation completed → interested →
  qualified → appointment or transfer;
- blocks by reason;
- average duration;
- **cost per completed call, per qualified Lead and per Appointment**, from the Organization's
  billed usage.

**FR-108 — Call list and detail.** The call list is filterable. The call detail shows:

- a timeline: dial, answer, disclosure, turns, tool actions, transfer events and end;
- the Transcript, Recording, AI Summary, Conversation Outcome and answers;
- the Eligibility Decision;
- per-turn latency;
- the Sync Records.

**FR-109 — Quality and side-effect panel.** Shows opt-outs, Complaint Records, compliance blocks
by reason, failed transfers, corrections by type, low-confidence calls, calls that hit limits,
and sync failures.

**FR-110 — Export.** A CSV export of call results for a date range or Campaign.

- It runs in the background.
- It is limited by the permission matrix and audited.
- It is protected against formula injection.
- The download link expires after 24 hours [ASSUMPTION A-50].

**FR-111 — Human Agent view.** A Human Agent sees their own transfers, callbacks and
Appointments.

**FR-112 — Platform operations view (Super Admin).** Shows, across Organizations:

- the §12 side-effect metrics;
- provider health, error rates and latency;
- queue depth and dead letters;
- cost against billed revenue per Organization.

### 8.15 Super Admin control plane (MVP subset)

**FR-113 — Organizations.** A Super Admin can list and inspect Organizations (Plan, state, usage,
health, Telecom Identity) and approve, suspend or reactivate them. Tenant call content is not
visible by default.

**FR-114 — Support access.** An `OWNER` or `ADMIN` can give a Support Access Grant, lasting 24
hours by default [ASSUMPTION A-51].

- Super Admins see call content only under a grant.
- Every view is audited.
- There is no impersonation and no hidden bypass.

**FR-115 — Provider configuration.** A Super Admin manages provider credentials: stored
encrypted, shown masked, and verified, rotated or disabled.

- They also set fallback order, health thresholds and model routing per task (live turn, summary,
  extraction).
- Per-Organization overrides are possible, for example an India-only processing policy (NFR-27).

**FR-116 — Rule Set management.** A Super Admin can view Rule Sets, draft a new version, validate
it, set its effective date and publish it.

- A Rule Set that fails validation cannot be published.
- Publication is audited.
- Approval by a second person is [POST-MVP] [ASSUMPTION A-52].

**FR-117 — Telecom verification queue.** Pending Telecom Identities, with their evidence, wait
here for review (FR-10).

**FR-118 — Plans and flags.** A Super Admin manages Plans, pilot assignment and per-Organization
feature flags.

**FR-119 — Platform stop and health.** A Super Admin can use the platform-wide Emergency Stop,
view system health and see alarm status.

**FR-120 — Audit viewer.** A Super Admin can search Audit Events across the platform.

### 8.16 Audit, data rights and retention

**FR-121 — Retention matrix.** Each data class has its own retention: Recordings, Transcripts,
AI Summaries, call metadata, Eligibility Decisions, consent ledgers, Audit Events and logs.

- Retention comes from the Rule Set, which sets the minimum and maximum, and from Organization
  settings within those bounds.
- Automated jobs delete expired data and record that they did.
- Draft defaults are in the addendum [ASSUMPTION A-53; VALIDATE VQ-6].

**FR-122 — Audit Events.** These actions are recorded in an append-only log:

- member and role changes;
- sign-in-policy changes;
- integration connect and disconnect;
- credential changes;
- Telecom Identity changes;
- Campaign start, pause and stop, and Emergency Stop;
- Rule Set publication;
- `REQUIRES_REVIEW` resolutions;
- Complaint Records;
- outcome corrections;
- exports;
- Recording access and downloads;
- data-rights actions;
- Support Access Grants and Super Admin views;
- Plan and billing changes.

Each Audit Event records the actor, Organization, time, before and after, and request ID. An
`OWNER` or `ADMIN` sees their Organization's Audit Events.

**FR-123 — Data-rights requests.** The Organization is the data fiduciary for its Leads. An
`OWNER` or `ADMIN` can find a person by phone or email and act on their request.

- **Export:** the person's personal data held in Nivomi.
- **Erase:** Recordings, Transcripts and personal fields. Excepted are:
  - the hashed Suppression List entry;
  - records that the law requires Nivomi to keep.
- **Tracking:** each request is tracked against a 90-day deadline.

Deleting data in the Organization's own HubSpot account is the Organization's decision; Nivomi
does not do it automatically [ASSUMPTION A-54].

**FR-124 — No training on tenant data.** Neither Nivomi nor its processors use tenant call audio
or Transcripts to train models, and no tenant's data is used for another tenant. Evaluation
datasets use only data from Organizations that have explicitly opted in [ASSUMPTION A-55]. This
depends on the processor agreements in VQ-5.

### 8.17 Inbound calls and phone numbers

Inbound calls are an MVP capability. They share the voice runtime, AI Agents, escalation,
Transcripts, AI Summaries, CRM sync, usage and analytics with outbound calls.

**FR-139 — Phone Number management.** An `ADMIN` can view the Organization's Phone Numbers. For
each number an `ADMIN` can:

- see its type and purpose: outbound Caller Number or inbound number;
- assign it to an AI Agent, a Campaign or an Inbound Route;
- enable or disable inbound calls.

Numbers are provisioned through `VoiceProvider` (see OD-2). Promotional 140xx Caller Numbers are not
used as inbound numbers [VALIDATE VQ-13].

**FR-140 — Inbound Routes.** For each inbound number, an `ADMIN` or `MANAGER` chooses who answers:

- the AI;
- a human, through Transfer Destinations tried in order;
- the AI first, with transfer to a human.

A route references an Agent Version and Transfer Destinations. Realizes UJ-9.

**FR-141 — Business hours and after hours.** Each Inbound Route has business hours and an
after-hours behaviour:

- the AI answers and offers a callback;
- the caller can leave a Voicemail (where configured);
- or a message plays and offers a callback.

A fallback applies when the AI or every destination is unavailable.

**FR-142 — Identifying the caller.** An inbound caller is matched by phone number to an existing
Contact in the Organization. If there is none, a new Contact and Lead are created with source
`inbound_call`.

- The call is recorded as an `INQUIRY` Consent Basis, with the call as evidence. This allows
  follow-up within the Rule Set's inquiry window [ASSUMPTION A-85; VALIDATE VQ-4].
- A withheld caller ID creates no Contact until the caller gives a number.

**FR-143 — Inbound conversation.** Inbound calls use the same conversation runtime and AI Agent
configuration as outbound calls. The same rules for disclosure, recording, Transcripts, AI
Summaries, Conversation Outcomes, Appointments, escalation, CRM sync and usage metering apply.
Analytics distinguish inbound from outbound.

**FR-144 — Inbound compliance.** Nivomi does not dial inbound calls, so they skip outbound
eligibility (consent, DND and time bands). The `ComplianceEngine` still governs:

- the disclosure;
- the recording notice;
- retention;
- jurisdiction.

Every outbound follow-up, such as an AI callback, passes eligibility (FR-44).

**FR-145 — Voicemail.** Where configured, an inbound caller can leave a Voicemail.

- It is stored as a Recording, under the retention rules (FR-121).
- It is transcribed and summarized.
- It becomes a Human Task.

Nivomi never leaves voicemail on outbound calls (FR-62).

### 8.18 Notifications and verification

**FR-146 — Email.** Nivomi sends transactional email through `EmailProvider` (Amazon SES):

- Member invitations and verification;
- integration and sync alerts;
- billing notices and invoices;
- usage alerts;
- scheduled reports.

Sending domains use SPF, DKIM and DMARC. Bounces and complaints put the address on an email
suppression list. Sends are idempotent and retried. Clerk sends its own authentication emails
[ASSUMPTION A-86].

**FR-147 — Phone verification (OTP).** Nivomi verifies a phone number it will call, such as a
Member's own number for test calls (FR-33) or a Transfer Destination, with an OTP sent through
`OtpProvider` (MSG91). OTPs [ASSUMPTION A-87]:

- are never logged or stored in plain text;
- expire after 5 minutes;
- allow 5 attempts;
- have a 30-second cooldown before resending;
- are rate-limited per number and per Member.

Sign-in uses Clerk (email plus authenticator-app MFA) rather than SMS, to avoid SMS cost
[ASSUMPTION A-88; VALIDATE VQ-15]. OTP SMS needs Nivomi's own DLT registration and an approved
template.

**FR-148 — In-app notifications.** Human Agents and Managers receive in-app notifications, and
email where enabled [ASSUMPTION A-89], for:

- incoming transfers;
- assigned callbacks and Human Tasks;
- callbacks that are due;
- integration failures.

## 9. Non-functional requirements

Numbers marked `[ASSUMPTION]` are provisional targets to validate in Phase A and Phase B. None of
them is an SLA.

### 9.1 Voice performance and quality

- **NFR-1 — Perceived turn latency.** The time from the end of the Lead's speech to the first
  audible AI response is at most 1.5 s at p50 and at most 2.0 s at p90, where technically
  achievable [ASSUMPTION A-56]. It is measured on every turn.
- **NFR-2 — Stage budgets.** Each turn records STT finalization, LLM time to first token, TTS time
  to first audio, and network time, so that regressions can be traced to a stage. Targets per
  stage are set in architecture.
- **NFR-3 — Answer to first speech:** at most 1 s (FR-54).
- **NFR-4 — Barge-in:** playback stops within 300 ms (FR-56).
- **NFR-5 — Audio quality.** STT word error rate is measured per language on the evaluation set,
  and TTS pronunciation is reviewed per language (names, numbers, places, currency). The
  thresholds are set from the Phase-A baseline, not invented here.
- **NFR-6 — Default LLM selection.** Before Phase B, the default model is chosen by evaluation on
  Indic-language sales conversations. The evaluation weighs, in order:
  1. Indian-language quality;
  2. conversational quality;
  3. latency;
  4. cost;
  5. reliability;
  6. context handling;
  7. tool calling;
  8. production availability in the required region.

  Popularity is not a criterion. The evaluation is repeatable, so a model can be replaced.

### 9.2 Reliability

- **NFR-7 — Availability.** Target 99.5% monthly for the web app and API in Phase B
  [ASSUMPTION A-57]. This is a target, not an SLA.
- **NFR-8 — Voice reliability.**
  - No call is dropped by a deploy: voice workers drain their connections first.
  - Platform-caused call failure is below 2% of dialled calls [ASSUMPTION A-58].
- **NFR-9 — Durability.**
  - A committed business event (outcome, consent change, opt-out, usage) is never lost.
  - Background work survives a worker crash and runs at least once, with idempotent consumers.
- **NFR-10 — Recovery.** Recovery point at most 15 minutes and recovery time at most 4 hours
  [ASSUMPTION A-59]. Restores are tested before Phase B.
- **NFR-11 — Provider isolation.** A failure of HubSpot, the calendar or Razorpay never stops
  calling. A failure of the telephony or speech provider pauses dialling cleanly and never
  produces fake outcomes.

### 9.3 Scalability and capacity

- **NFR-12 — Phase B capacity.** 50 concurrent calls across the platform, 10 per Organization by
  default, and up to 30,000 calls a month [ASSUMPTION A-60].
- **NFR-13 — Designed for 100×.** Capacity grows by adding workers, with no rewrite (CLAUDE.md).
  Capacity is planned per concurrent call.
- **NFR-14 — Imports.** A 100,000-row import completes within 10 minutes [ASSUMPTION A-61] and
  does not slow live calls.

### 9.4 Multi-tenancy and isolation

- **NFR-15 — Zero cross-tenant access.** Isolation is enforced in every layer:
  - API, services and data access;
  - queue payloads and workers;
  - files and Recordings;
  - AI context and prompts;
  - HubSpot connections and webhooks;
  - Telecom Identities and Caller Numbers;
  - caches, analytics, exports and logs.
- **NFR-16 — Isolation tests.** Every feature that touches data ships automated cross-tenant access
  tests, including webhook and worker paths. A failing isolation test blocks release.
- **NFR-17 — AI context isolation.** The LLM context for a Call contains only the calling
  Organization's configuration and that Lead's data.

### 9.5 Security

- **NFR-18 — Encryption.**
  - All traffic uses TLS 1.2 or later.
  - Data at rest is encrypted, with managed keys.
  - Provider and HubSpot credentials use envelope encryption. They are masked and never returned
    or logged.
- **NFR-19 — Secrets.** No secret appears in code or the repository. Secrets come from a secrets
  manager, and production refuses to start with missing configuration.
- **NFR-20 — Webhooks.** Every inbound webhook (telephony, HubSpot, Clerk, Razorpay) is
  signature-verified, protected against replay and processed idempotently.
- **NFR-21 — Input and file safety.** Every input is validated. Uploads are type-checked,
  size-limited and scanned. CSV output is protected against formula injection.
- **NFR-22 — Super Admin controls.** MFA is required, every action is audited, and there is no
  hidden bypass or impersonation (FR-114).
- **NFR-23 — Security review.** Before Phase B:
  - a threat model covering telephony fraud (toll fraud, number misuse), prompt injection and
    tenant isolation;
  - a dependency audit;
  - an external penetration test before Phase C [ASSUMPTION A-62].
- **NFR-24 — Least privilege.** Members, services and provider scopes get only the permissions
  they need. HubSpot OAuth requests only the scopes the MVP uses.

### 9.6 Privacy and data residency

- **NFR-25 — Primary storage in India.** Nivomi's databases, Recordings, Transcripts, backups and
  logs are stored in AWS Mumbai (ap-south-1).
- **NFR-26 — Processor register.** Nivomi keeps a register of the processors that receive
  personal data, with their locations and agreements:
  - Clerk: US;
  - HubSpot: the tenant's own account, outside India;
  - Sarvam;
  - the LLM provider;
  - Exotel;
  - Razorpay.

  Organizations see it before they sign up.

- **NFR-27 — Residency policy per Organization.** The router honours a per-Organization
  "India-only processing" policy for the LLM and speech providers, where an in-country option
  exists. The platform default is **not** India-only [ASSUMPTION A-63]. Clerk and HubSpot cannot
  meet India-only processing; this is disclosed.
- **NFR-28 — Minimization.** Nivomi collects no personal data beyond what the journey needs.
  Logs carry IDs, not transcripts or phone numbers, except where masked.

### 9.7 Observability

- **NFR-29 — Correlated telemetry.** The application is instrumented with OpenTelemetry and
  exports logs, metrics and traces to Grafana Cloud. AWS infrastructure metrics and alarms stay in
  CloudWatch. No application code depends on a Grafana SDK. Telemetry carries the trace, span,
  request, Organization, call, conversation, Campaign, job and provider IDs, so a single call can
  be traced from dial to CRM sync.
- **NFR-30 — Per-call metrics.**
  - Stage latencies per turn.
  - Provider errors and fallbacks.
  - Tokens, cost and duration.
  - Outcome, confidence and whether a correction followed.
- **NFR-31 — Alarms.** Alarms cover:
  - provider error rate and latency;
  - dial failure rate;
  - queue depth and dead letters;
  - HubSpot sync failure rate;
  - complaint-breaker trips;
  - cost anomalies per Organization;
  - billing reconciliation mismatches.
- **NFR-32 — Log retention and time.** ICT system logs are kept for 180 days in India, and clocks
  are synchronized to an approved time source (CR-12). The Grafana Cloud stack is in its India
  region (AWS ap-south-1), and long-term log archives stay in S3 in Mumbai
  [ASSUMPTION A-90; VALIDATE VQ-14].
- **NFR-33 — Product and operations visibility.** The §12 side-effect metrics are available to
  Nivomi's product and operations teams (FR-112) without running database queries.

- **NFR-40 — Safe, bounded telemetry.**
  - Logs never contain passwords, OTPs, tokens, API keys, payment secrets, authorization headers,
    unnecessary personal data or raw conversation content.
  - Phone numbers, emails, Transcripts and Lead IDs are never used as unbounded metric labels.
- **NFR-41 — Dashboards.** Eight dashboards, each with alerts:
  - Executive Overview;
  - Voice Operations;
  - AI Performance;
  - Provider Health;
  - Infrastructure;
  - Human Escalation;
  - Cost & Usage;
  - CRM & Data Ingestion.
- **NFR-42 — Telemetry cost.** Trace sampling, log levels and retention tiers are configuration, so
  the cost of observability stays proportional to traffic.

### 9.8 Usability, localization and accessibility

- **NFR-34 — Interface language.** The web interface is in English for the MVP
  [ASSUMPTION A-64]. Calls support en, hi, ml, ta, te and kn. The AI Summary is in English
  (FR-68).
- **NFR-35 — Form factor.** The product is a desktop-first responsive web app, with no mobile app
  [ASSUMPTION A-65]. The Human Agent's pages ("My callbacks", transfer context) work on a phone
  browser.
- **NFR-36 — Setup.** A new Organization can finish its setup without help from Nivomi engineering.
  A guided checklist shows exactly what is still missing (UJ-2).
- **NFR-37 — Accessibility.** The web app targets WCAG 2.1 AA [ASSUMPTION A-66].

### 9.9 Provider independence and maintainability

- **NFR-38 — Adapters only.** Product logic depends only on the provider interfaces:
  `VoiceProvider`, `STTProvider`, `TTSProvider`, `LLMProvider`/`LLMRouter`, `CRMProvider`,
  `CalendarProvider`, `PaymentProvider`, `StorageProvider`, `EmailProvider`, `OtpProvider`,
  `FileImportProvider`. No vendor SDK objects or identifiers
  cross those interfaces.
- **NFR-39 — Configuration as data.** Plans, limits, Rule Sets, provider routing, feature flags and
  prompt guardrails are data managed through Super Admin or migrations, never constants in code.

## 10. Compliance requirements

The source is the India compliance research of 2026-09-25 (R1 to R4). Legal interpretation must be
confirmed by Indian telecom and privacy counsel before Phase B (AC-6). Every rule below is Rule
Set **data**, and the confidence of each is carried from the research.

- **CR-1 — Call classification.** Every AI Agent and Campaign has a call category. Any sales or
  qualification content makes the call **promotional**. An appointment confirmation for an
  ongoing purchase may be **service**, subject to counsel.
- **CR-2 — Number series.**
  - Promotional calls use only 140xx Caller Numbers.
  - Service calls use 1601xx, or 1600xx for banking, financial services and insurance (BFSI).
  - Ordinary 10-digit numbers are blocked for commercial calls until counsel confirms otherwise.
- **CR-3 — Sender registration.** No call is made until the Organization's DLT principal-entity
  registration and annual self-certification are recorded and verified.
- **CR-4 — A2P declaration.** No call is made from a number outside the Organization's declared
  A2P or auto-dialer ranges.
- **CR-5 — Preferences and windows.**
  - The preference registry (NCPR/DND) status and categories are checked.
  - The default promotional window is 10:00–21:00 in the recipient's local time.
  - An unavailable registry check makes the call `DEFERRED`, never `ELIGIBLE`.
- **CR-6 — Consent basis.** A promotional call to a number that has blocked promotions requires
  registered explicit consent. The 7-day inquiry window (3 months for applications) is stored with
  its evidence and expires automatically. It does **not** override a DND block until counsel
  confirms (VQ-4).
- **CR-7 — Opt-out.** An opt-out applies immediately with a 90-day re-consent block (FR-51).
- **CR-8 — Complaint breaker.** The breaker trips well before TRAI's 3-complaint (with an operator
  flag) or 5-complaint suspension thresholds in 10 days (FR-49). Pacing, answer-to-speech latency
  and call duration are treated as compliance controls, because operators flag high volume, short
  calls and silent calls.
- **CR-9 — Sector overlays.** Sector-specific series, calling windows and data-localization
  constraints (for example RBI and IRDAI for BFSI) are applied from the Organization's sector.
  How BFSI tenants are handled in Phase B is **OD-5**.
- **CR-10 — AI disclosure and recording notice.**
  - An audible statement that the caller is an AI opens every call. Tenants can strengthen it but
    cannot remove it.
  - A recording notice plays when recording is on.
  - Basis: the draft CCPA guidelines and good practice. No binding rule requires them today.
- **CR-11 — DPDP readiness.** The DPDP obligations are expected to bind from about 13 May 2027.
  Nivomi is built for them now:
  - notice and consent tooling for tenants as fiduciaries;
  - separate consent ledgers;
  - data-rights requests with a 90-day response;
  - breach notification: affected people without delay and a 72-hour detailed report to the Board;
  - processor contracts;
  - retention of at least one year for data and logs, subject to counsel (VQ-6);
  - no training on tenant data.
- **CR-12 — CERT-In (in force now).**
  - Report cyber incidents within 6 hours.
  - Keep ICT logs for 180 days in India.
  - Synchronize clocks to an approved time source.
  - Name a point of contact.
- **CR-13 — Nivomi's role.** Nivomi acts as a processor for tenant Lead data and does not use it
  for its own purposes, so it does not become a fiduciary for that data. Counsel confirms this
  position (VQ-3).
- **CR-14 — Regulatory change.**
  - The Third Amendment's effective dates (+30, +60 and +90 days after Gazette publication), the
    CCPA draft and DPDP commencement are tracked as Rule Set versions with effective dates.
  - The staleness triggers in the research are re-checked monthly until Phase C
    [ASSUMPTION A-67].

## 11. Success metrics

No conversion-rate target is set: there is no customer data yet. Targets are provisional
`[ASSUMPTION]` values to confirm or replace after Phase A. Accuracy metrics are measured against
human review of a stratified sample of calls, per language, plus corrections (FR-71).

**Primary — does the journey work?**

- **SM-1 — End-to-end journey success.** The share of design-partner Organizations that complete
  AC-1 in production without Nivomi engineering help. Target: 100% of Phase B Organizations.
  Validates FR-1 to FR-124.
- **SM-2 — Connected-call conversation completion.** Connected calls that reach a Conversation
  Outcome other than `INCOMPLETE`, divided by connected calls. Target: at least 85%
  [ASSUMPTION A-68]. Validates FR-55 to FR-67.
- **SM-3 — HubSpot sync success.** Syncable events that are `SYNCED` within 15 minutes, divided by
  syncable events. Target: at least 99% [ASSUMPTION A-69]. Validates FR-88 to FR-95.
- **SM-4 — Cross-tenant incidents.** Target: **0**. This is a hard requirement. Validates NFR-15
  to NFR-17.
- **SM-5 — Predictable cost.** The coefficient of variation of platform cost per connected minute
  per Organization, week over week. Target: at most 15% [ASSUMPTION A-70]. Validates FR-98 and
  §13.

**AI quality (per language and per AI Agent)**

| Metric                               | Definition                                                         | Target                  |
| ------------------------------------ | ------------------------------------------------------------------ | ----------------------- |
| SM-6 Qualification accuracy          | Qualification Results that humans agree with                       | ≥ 90% [ASSUMPTION A-71] |
| SM-7 Intent / interest accuracy      | Interest classification that humans agree with                     | ≥ 90% [ASSUMPTION A-71] |
| SM-8 Appointment extraction accuracy | Booked Appointments whose date, time and type match the Transcript | ≥ 98% [ASSUMPTION A-72] |
| SM-9 Entity extraction accuracy      | Qualification answers that match the Transcript                    | ≥ 90% [ASSUMPTION A-71] |
| SM-10 Escalation correctness         | Handoffs judged warranted, plus warranted Handoffs not missed      | ≥ 90% [ASSUMPTION A-71] |
| SM-11 STT accuracy                   | Word error rate on the per-language evaluation set                 | Baseline in Phase A     |
| SM-12 TTS quality                    | Pronunciation-error rate on names, numbers and places per language | Baseline in Phase A     |
| SM-13 Barge-in success               | Interruptions where playback stopped within 300 ms                 | ≥ 95% [ASSUMPTION A-73] |

**Calling and performance**

- **SM-14:**
  - Calls initiated and calls connected.
  - Connection rate: connected divided by dialled. This is tracked, with no target, because it
    depends on lead quality.
  - Average call duration.
  - Call-completion rate.
  - Failed-call rate (platform-caused below 2%, NFR-8).
  - Transfer rate.
- **SM-15:**
  - STT, LLM and TTS latency.
  - Perceived turn latency against NFR-1.
  - Provider error rate.
  - Call failure rate by cause.

**Business (tracked per Organization; no targets until there is data)**

- **SM-16:**
  - Qualified Leads, interested Leads and Appointments created.
  - Cost per completed call, per qualified Lead and per Appointment.
  - Speed to lead: the median time from Lead creation to first connected call.
  - Human Agent time saved, estimated as connected AI minutes that did not lead to a Handoff.

## 12. Side-effect and failure metrics

These are **counter-metrics**. Nobody should optimize a success metric in a way that worsens them.
They are visible to tenant Managers (FR-109, for their own Organization) and to Nivomi product and
operations (FR-112, across Organizations). Each has an alert threshold [ASSUMPTION A-74].

| ID     | Metric                                                                          | Counterbalances     | Alert when                       |
| ------ | ------------------------------------------------------------------------------- | ------------------- | -------------------------------- |
| SM-C1  | Opt-out rate: opt-outs divided by connected calls                               | SM-2, SM-16 volume  | > 5% per Campaign per week       |
| SM-C2  | Complaint Records and operator flags                                            | Any volume increase | ≥ 1 (breaker at 2, FR-49)        |
| SM-C3  | Compliance blocks by reason, and `REQUIRES_REVIEW` backlog                      | Connection rate     | Backlog older than 48 h          |
| SM-C4  | Failed Live Transfers: `TRANSFER_FAILED` divided by transfer attempts           | Transfer rate       | > 20%                            |
| SM-C5  | Incorrect qualification: correction rate on Qualification Results               | SM-6                | > 10%                            |
| SM-C6  | Incorrect Appointments: Appointments corrected, rescheduled by error or wrong   | SM-8                | > 2%                             |
| SM-C7  | Ungrounded statements: AI claims not in knowledge or Transcript, sampled        | SM-2, SM-6          | Any confirmed case gets reviewed |
| SM-C8  | Duplicate HubSpot records created by Nivomi                                     | SM-3                | > 0.5% of synced contacts        |
| SM-C9  | HubSpot sync failures and dead letters                                          | SM-3                | Dead-letter queue > 0 for 1 h    |
| SM-C10 | Excessive duration: calls hitting the maximum duration or loop limits           | SM-2                | > 5%                             |
| SM-C11 | Excessive AI cost: LLM/STT/TTS cost per connected minute versus the Plan margin | SM-5                | > 1.5× trailing median           |
| SM-C12 | STT errors: turns re-prompted because of misrecognition, per language           | SM-11               | > 15% of turns                   |
| SM-C13 | TTS pronunciation errors reported or sampled                                    | SM-12               | Trend up week over week          |
| SM-C14 | Unwanted calls: calls to Leads whose Consent Basis was later found invalid      | Speed to lead       | Any                              |
| SM-C15 | Provider outages and fallbacks per provider                                     | SM-14/15            | Any outage > 5 min               |
| SM-C16 | Early hang-ups: connected calls ended by the Lead within 10 s                   | Dial volume, pacing | > 30% per Campaign               |
| SM-C17 | Import quality: failed rows and the `REVIEW` backlog per Import Job             | Speed to lead       | `REVIEW` backlog older than 48 h |
| SM-C18 | Escalations caused by provider failure, per provider                            | SM-2                | > 2% of connected calls          |
| SM-C19 | Missed inbound calls, and Voicemails not worked within a business day           | Inbound volume      | Any                              |
| SM-C20 | Callbacks and Human Tasks `EXPIRED` or overdue                                  | Transfer rate       | > 5% per week                    |

## 13. Cost considerations

Cost is a product concern because pricing depends on it (OD-4) and runaway AI or telephony cost
is a real failure mode.

- **Cost components per call:**
  - telephony per minute;
  - STT per audio second;
  - TTS per character;
  - LLM tokens for live turns, summaries and extraction;
  - recording storage;
  - HubSpot API calls (no direct cost, but rate-limited);
  - platform compute.

  **No provider prices are assumed here.** They come from current contracts.

- **Measure before pricing.** Phase A and Phase B produce a measured cost per connected minute,
  per completed call, per qualified Lead and per Appointment, for each language and AI Agent (FR-98,
  FR-107). The owner sets Plan values from these figures (OD-4).
- **Guardrails** (FR-31, FR-43, FR-61, FR-100):
  - per-call duration and token budgets;
  - loop detection;
  - Campaign budgets;
  - Organization Overage caps;
  - an Emergency Stop.

  The complaint breaker also protects against losing the telephony entirely.

- **Cost levers** that the architecture must allow without code changes:
  - choosing the model per task (a smaller model for extraction and summaries);
  - caching agent prompts;
  - voicemail detection;
  - retry and pacing policies;
  - a recording opt-out.
- **Margin visibility.** Nivomi operations see platform cost against billed revenue per
  Organization (FR-112) and the SM-C11 alert.
- **Infrastructure.** Use the simplest production-grade AWS setup (ADR-010). Voice workers scale
  with the number of concurrent calls, and everything else stays small.

- **Supporting services.** Each of these is metered or budgeted and appears in the platform cost
  view (FR-112):
  - MSG91 OTP SMS, kept low by using Clerk email and authenticator sign-in;
  - SES email;
  - Grafana Cloud ingestion and retention, controlled through sampling, retention tiers and label
    limits;
  - AWS.

## 14. Risks

| ID    | Risk                                                                                                                               | Impact                                                | Mitigation / validation                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RK-1  | Exotel's AI streaming for **outbound** calls is not publicly documented                                                            | Blocks the core journey                               | VQ-1 written confirmation plus a technical spike before the voice epic; `VoiceProvider` keeps a second provider possible |
| RK-2  | Live Transfer is possible only after the AI stream ends; it may be slow or awkward                                                 | Poor handoff experience                               | FR-75/76 designed around it; VQ-2; measure SM-C4                                                                         |
| RK-3  | A tenant's campaign is suspended or blacklisted by operators                                                                       | That tenant loses all telephony for 15 days to 1 year | CR-8 breaker, pacing, answer-to-speech target, per-tenant Telecom Identity                                               |
| RK-4  | Regulatory change: Third Amendment dates, CCPA AI-disclosure rules, DPDP timing                                                    | Rework, non-compliance                                | Rule Sets as data with effective dates (FR-46); monthly re-check (CR-14)                                                 |
| RK-5  | Legal questions still open: telemarketer registration, inquiry window versus DND, recording basis, verbal consent, Nivomi's role   | Launch blocked or unlawful calls                      | Counsel review is a launch gate (AC-6); fail-closed defaults                                                             |
| RK-6  | Callable pool smaller than customers expect (DND, consent evidence, 7-day window)                                                  | Weak value and churn                                  | Continuous Campaigns for fast follow-up; clear pre-launch block reasons; set expectations at onboarding                  |
| RK-7  | Indic STT accuracy, code-mixing and noisy lines                                                                                    | Wrong answers, frustrated Leads                       | Per-language evaluation (SM-11); re-prompt limits; low-confidence Handoff                                                |
| RK-8  | End-to-end latency above target, especially with LLM inference outside India                                                       | Unnatural calls, early hang-ups                       | Stage budgets (NFR-2); model choice weighs latency (NFR-6); SM-C16                                                       |
| RK-9  | Hallucinated facts or promises                                                                                                     | Customer harm, liability                              | Approved knowledge only, guardrails (FR-34), grounded summaries, SM-C7 sampling                                          |
| RK-10 | Unit economics unknown                                                                                                             | Unprofitable plans                                    | Measure first (§13); Overage caps; OD-4 after Phase B                                                                    |
| RK-11 | Sarvam's policies conflict on training and retention; no public DPA                                                                | Privacy breach of FR-124                              | Signed DPA with no training (VQ-5) before Phase B; fallback STT/TTS                                                      |
| RK-12 | HubSpot API limits, duplicates and the scopes each tenant's plan allows                                                            | Sync failures, duplicate records                      | Search before create, idempotency, SM-C8/9; verify APIs (VQ-10)                                                          |
| RK-13 | Razorpay may not support metered Overage and GST invoices natively                                                                 | Billing workarounds                                   | VQ-11 before the billing epic; Nivomi computes Overage and uses a supported charge mechanism                             |
| RK-14 | BFSI tenants bring sector localization and calling-window rules                                                                    | Non-compliance, or tenants blocked                    | OD-5; sector overlays (CR-9); per-Organization residency policy (NFR-27)                                                 |
| RK-15 | Small team with a broad MVP                                                                                                        | Delays                                                | Strict non-goals (§7.2); defer the calendar provider decision risk with the Nivomi availability fallback (FR-80)         |
| RK-16 | Single region (Mumbai)                                                                                                             | A regional outage stops service                       | Multi-AZ; tested backups; accepted for the MVP                                                                           |
| RK-17 | Promotional 140xx numbers are believed to be outbound-only, so a Lead calling back the number that called them may not get through | Missed call-backs                                     | Separate inbound numbers (FR-139); say the callback number during the call; VQ-13                                        |
| RK-18 | Telemetry cost and log residency with Grafana Cloud                                                                                | Cost overrun; CERT-In gap                             | India region; sampling and retention tiers; S3 archive in Mumbai; VQ-14                                                  |
| RK-19 | Data quality in customer spreadsheets: formats, duplicates, missing consent evidence                                               | Wrong calls, duplicates, callable pool shrinks        | Mapping, preview, `REVIEW` outcome, compliance flags before confirmation                                                 |
| RK-20 | OTP SMS depends on Nivomi's own DLT registration and templates                                                                     | Phone verification blocked                            | Register early; Clerk handles sign-in without SMS                                                                        |
| RK-21 | Scope growth: inbound calls, dual ingestion and escalation added to a small-team MVP                                               | Delays                                                | Shared runtime for inbound and outbound; strict non-goals; staged epics (review plan)                                    |

**RK-1 update (2026-09-26).** Exotel's developer documentation now describes outbound AI calls
through the Connect Voice AI API (bidirectional WebSocket; 8, 16 or 24 kHz). This lowers the
technical risk. Transfer needs "Connect with Flow" or Programmable Voice, and the compliance
questions in VQ-1 remain open.

## 15. Acceptance criteria

**AC-1 — MVP end-to-end acceptance test.** This is the primary acceptance test. On production
(Phase B), with real providers, a design-partner Organization completes every step below without
Nivomi engineering intervention. Each step lists its observable pass condition.

| #   | Step                           | Pass condition                                                                                                        |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Organization signs up          | Organization exists; creator is `OWNER`; audited (FR-1)                                                               |
| 2   | Configures the account         | Settings, members with roles, and MFA for `OWNER`/`ADMIN` in place (FR-2, FR-5, FR-6)                                 |
| 3   | Connects required integrations | Telecom Identity `VERIFIED`; calendar connected or Nivomi availability set (FR-10, FR-80)                             |
| 4   | Connects its own HubSpot       | CRM Connection `CONNECTED` to that Organization's account only (FR-84)                                                |
| 5   | Creates an AI Agent            | Published Agent Version with questions, disclosure and escalation; test call succeeds (FR-26 to FR-33)                |
| 6   | Imports or selects Leads       | Leads imported with Consent Basis; import report shows rejects (FR-14 to FR-19)                                       |
| 7   | Creates a Campaign             | Campaign configured, pinned to an Agent Version (FR-35)                                                               |
| 8   | Compliance checks eligibility  | Pre-launch check shows eligible and blocked counts by reason; decisions stored (FR-36, FR-44 to FR-48)                |
| 9   | Campaign starts                | Status `RUNNING`; dialling respects pacing and windows (FR-37)                                                        |
| 10  | Nivomi calls eligible Leads    | Only `ELIGIBLE` Leads dialled; re-checked at dial time (FR-39)                                                        |
| 11  | AI conducts the conversation   | Disclosure spoken within 1 s; configured language; barge-in works (FR-54 to FR-57)                                    |
| 12  | AI qualifies the Lead          | Answers captured with evidence; Qualification Result computed (FR-66, FR-28)                                          |
| 13  | AI detects interest            | Conversation Outcome and interest recorded (FR-67)                                                                    |
| 14  | AI schedules an Appointment    | Slot read back; Appointment `BOOKED`; no double booking (FR-81)                                                       |
| 15  | AI transfers to a human        | Live Transfer connects, or on failure a callback is scheduled; events on the timeline (FR-75 to FR-78)                |
| 16  | Recording, where permitted     | Recorded only with recording enabled, notice approved and the Rule Set permitting; notice played (FR-60)              |
| 17  | Transcript generated           | Complete Transcript within 2 minutes at p95 (FR-65)                                                                   |
| 18  | AI Summary generated           | Grounded summary present (FR-68)                                                                                      |
| 19  | Outcome stored                 | Outcome in Nivomi; Lead Status updated (FR-67, FR-70)                                                                 |
| 20  | HubSpot synchronized           | Contact, call, note, meeting (and deal if enabled) in **that Organization's** HubSpot, no duplicates (FR-88 to FR-92) |
| 21  | Usage recorded                 | Usage Events for the Call; totals match provider records within 1% [ASSUMPTION A-75] (FR-98)                          |
| 22  | Manager sees results           | Dashboard and campaign report reflect the Calls within the freshness targets (FR-106, FR-107)                         |

Steps 4 and 20 apply when the Organization connects a CRM. AC-7 covers an Organization that has
none.

**AC-2 — Tenant isolation.** An automated suite, run in CI, proves that Organization A cannot
read, change, export, receive webhooks for, sync to, or see analytics for Organization B. It
covers the API, workers, queue payloads, files, Recordings, HubSpot routing, Caller Numbers and AI
context. The suite passes with zero failures.

**AC-3 — Compliance fail-closed.** Automated scenarios return `BLOCKED`, `DEFERRED` or
`REQUIRES_REVIEW`, never `ELIGIBLE`, for each of these:

- no Consent Basis;
- an expired inquiry window;
- a DND-blocked number without registered consent;
- a Suppression List hit;
- a time outside the calling window;
- an unverified Telecom Identity;
- a series that does not match the call category;
- an undeclared number;
- an unknown jurisdiction;
- an unavailable registry check;
- a tripped breaker;
- exhausted budget;
- a `PAST_DUE` Subscription past its grace period.

**AC-4 — Failure handling.** Automated or staged tests show correct behaviour for each of these:

- STT, TTS or LLM failure mid-call, with and without a fallback (UJ-7);
- a telephony failure;
- a HubSpot outage and a revoked token (UJ-1 edge case);
- duplicate webhook delivery from each provider;
- a worker crash during a Campaign (no lost or duplicated Call Attempts);
- a failed Live Transfer;
- a database failover;
- an Emergency Stop while calls are in progress.

**AC-5 — Opt-out and data rights.** An in-call opt-out blocks every later Call Attempt before the
Call ends (UJ-4). A data-rights export and an erasure complete, and the erased number stays
suppressed.

**AC-6 — Launch gates for Phase B.**

1. AC-1 to AC-5 pass on staging.
2. Written answers from Exotel on VQ-1, VQ-2 and VQ-7.
3. A signed Sarvam DPA with no training (VQ-5).
4. Counsel sign-off on India Rule Set v1 and the open legal questions (VQ-3, VQ-4, VQ-6).
5. The default LLM chosen by evaluation (NFR-6).
6. A load test at NFR-12 capacity.
7. A restore test (NFR-10).
8. A security review (NFR-23).
9. Runbooks for incidents (CERT-In 6 hours) and breaches (DPDP 72 hours).
10. OD-2 and OD-3 decided.
11. Nivomi's own DLT registration and OTP template approved (FR-147).
12. The production-readiness checklist in the architecture readiness review is complete for the
    items that Phase B needs.

**AC-7 — Excel only.** An Organization with no CRM Connection completes the journey:

- upload → map columns → preview → validate → deduplicate → compliance → confirm → import;
- Contacts and Leads created → Campaign → AI call → qualification → AI Summary;
- usage → analytics.

Nothing in the flow asks for a CRM (UJ-8).

**AC-8 — CRM only.** The journey runs from HubSpot alone:

- connect HubSpot through OAuth → fetch contacts → map fields → validate → deduplicate → store in
  Nivomi;
- Campaign → AI call → qualification → AI Summary;
- CRM sync → usage → analytics.

**AC-9 — Excel and CRM together.** HubSpot is connected and an Excel file uploaded. Both are
ingested and deduplicated with the `CREATE`, `UPDATE`, `SKIP` and `REVIEW` outcomes, and every
record keeps its source metadata. The Campaign → AI call → outcome → CRM sync updates the matched
HubSpot records with no duplicates (UJ-10).

**AC-10 — Inbound.** The path runs:

- caller → inbound number → Inbound Route → AI;
- intent detection → answer or qualification → Appointment or escalation;
- Transcript → AI Summary → Nivomi record;
- CRM sync (when connected) → analytics.

The after-hours path works too: a callback or a Voicemail becomes a Human Task (UJ-9).

**AC-11 — Human escalation.** Each of these triggers reaches the `EscalationEngine` and starts a
Live Transfer: a request for a human, repeated misunderstanding, and a provider failure.

- **If the transfer succeeds:** a human takes the call.
- **If it fails:** bounded retry → Scheduled Callback + Human Task + CRM update.

The Lead is never silently disconnected.

**AC-12 — CRM failure.** A Call succeeds while HubSpot is unavailable:

1. The result is stored in Nivomi.
2. The CRM event is queued and retried, and dead-lettered if necessary, with an alert.
3. It eventually syncs.

The Call remains successful throughout.

**AC-13 — Provider failures.** Each failure is tested: STT, LLM, TTS, Exotel, CRM, OTP, email and
calendar. For each, the platform follows: retry where appropriate → fallback where configured →
escalation where necessary → Audit Event → metric → alert where appropriate. A calendar failure
never produces a confirmed Appointment (FR-135).

## 16. Open decisions

### 16.1 Owner decisions required

These materially affect scope, the business model, compliance or architecture. Each has a default
so that work can continue.

| ID   | Decision                                                                                                                            | Why it matters                                                                            | Needed before                    | Draft default                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1 | **Default CalendarProvider:** Google Calendar, Microsoft calendar or HubSpot Meetings                                               | Integration effort, what customers use, API capability; HubSpot reuses the existing OAuth | Appointment epic                 | None. Nivomi availability windows work without a calendar (FR-80). A short spike is recommended (addendum)                                                                   |
| OD-2 | **Telephony account model:** Nivomi-managed Exotel with per-tenant numbers, or each tenant's own Exotel account connected to Nivomi | Who holds KYC and DLT; telephony billing pass-through; onboarding friction; blast radius  | Telephony epic                   | Leaning to numbers that Nivomi provisions per Organization ("a Nivomi number", FR-139) [ASSUMPTION A-91]; final after VQ-1 and counsel's answer on telemarketer registration |
| OD-3 | **Consent evidence standard for imported Leads:** per-Lead evidence required, or a batch attestation by the tenant plus a reference | Compliance exposure versus import friction                                                | Lead-import epic                 | Per-Lead basis plus timestamp, source and reference, with a batch attestation (FR-16)                                                                                        |
| OD-4 | **Pricing:** Plans, Included Usage, overage rate, **billable unit and rounding**, inbound-number rental, pilot terms                | Revenue model; billing semantics                                                          | Phase C (pilot Plans until then) | Connected minutes rounded up per call (A-43); inbound and outbound minutes metered the same way until decided [ASSUMPTION A-92]; pilot Plans for Phase B                     |
| OD-5 | **BFSI and insurance tenants in Phase B?**                                                                                          | Sector overlays (1600xx series, RBI and IRDAI windows, localization) add rules and risk   | Phase B cohort selection         | Exclude from Phase B until counsel has reviewed the overlays                                                                                                                 |
| OD-6 | **Lead-ingestion API or webhook in the MVP?** Web forms and portals pushing inquiries straight into Nivomi                          | Speed to lead within the 7-day window, for customers who do not use HubSpot forms         | Lead-import epic                 | Not in the MVP; HubSpot webhooks, Excel/CSV and inbound calls cover it. The data model already has the `api` and `website` source types                                      |

### 16.2 Decisions locked by this PRD

These come from the owner, 2026-09-26, together with the existing ADRs:

- **Market and product:**
  - India first, vertical-agnostic, sales-assistance positioning.
  - Outbound and inbound calls in the MVP (revision 2); contact-centre features are [POST-MVP].
- **Providers:**
  - Exotel, Sarvam STT and TTS, and an evaluated LLM behind the router.
  - HubSpot per Organization (never a global account), and optional for each Organization.
  - Razorpay with subscription, Included Usage and Overage; no public prices yet.
- **Platform:**
  - Clerk with Nivomi RBAC and the six Roles plus Super Admin.
  - AWS Mumbai without EKS.
- **Journey and handoff:**
  - The 22-step acceptance journey (AC-1).
  - Live Transfer as the primary Handoff, with Scheduled Callback as the fallback.
  - Appointments behind a CalendarProvider, owned by Nivomi.
- **Compliance and metrics:**
  - The AI disclosure is always on and cannot be removed.
  - No invented conversion targets; side-effect metrics are required.
- **Revision 2 (the owner's master architecture prompt):**
  - Every source converges on Nivomi's Contact, Lead and Company records. Excel-only, CRM-only
    and combined Organizations are all supported, and Campaigns never depend on CRM objects.
  - The `EscalationEngine` has five decisions. A failed transfer leads to bounded retry, then a
    callback, a Human Task and a CRM update.
  - Email uses Amazon SES (`EmailProvider`) and OTP uses MSG91 (`OtpProvider`).
  - Application observability uses OpenTelemetry and Grafana Cloud; AWS infrastructure uses
    CloudWatch.

### 16.3 Conflicts found in the inputs, and how this PRD resolves them

1. **Product brief versus owner scope.** The brief's capability table lists inbound calls, a
   `sendMessage` tool, event-triggered workflows and Organization-defined statuses. The owner's
   MVP scope excludes or defers them.
   - _Resolved:_ the owner's scope wins (§7.2). The brief stays an input and is not edited.
2. **Live Transfer as the primary handoff versus provider documentation.** Exotel documents
   transfer only after the AI stream closes, and does not document outbound AI streaming.
   - _Resolved:_ the requirement is kept, and Live Transfer is designed as a one-way exit
     (§8.10). RK-1, RK-2, VQ-1 and VQ-2 are raised.
3. **Monthly lead batches versus the 7-day inquiry window and DND.** Older imported leads may not
   be callable.
   - _Resolved:_ continuous Campaigns and HubSpot webhooks support fast follow-up. Block reasons
     are stated explicitly, and RK-6 is raised.
4. **Self-serve sign-up versus manual telecom registration.** DLT registration and 140xx
   provisioning happen outside Nivomi.
   - _Resolved:_ Super Admin verification is an operational step, and the product guides the
     tenant through it (UJ-2, §7.4).
5. **The provider list in CLAUDE.md and ARCHITECTURE.md has no `CalendarProvider`,** but the
   owner's architecture includes one.
   - _Action:_ add it during `bmad-architecture`, with an ADR.
6. **ROADMAP.md names `docs/planning/prd.md`** as the PRD path, but BMAD writes to
   `docs/planning/prds/prd-Nivomi-2026-09-26/`.
   - _Action:_ update the roadmap link when the PRD is finalized.
7. **Retention.** DPDP Rule 8(3) requires at least one year of data and logs, while Exotel's
   default keeps recordings for 90 days and minimization favours short retention.
   - _Resolved:_ a retention matrix with counsel review (FR-121, VQ-6).
8. **Inbound calls.** The first brain dump deferred inbound calls to after the MVP; revision 2
   makes them core.
   - _Resolved:_ inbound is in scope (§8.17), and advanced contact-centre features stay deferred.
9. **Is HubSpot "required"?** The brain dump said it was required for the MVP. Revision 2 says no
   tenant has to connect a CRM.
   - _Resolved:_ the integration ships in the MVP, but connecting it is optional (FR-136).
10. **Observability.** ADR-010 names CloudWatch for logs and metrics, while revision 2 adds
    OpenTelemetry and Grafana Cloud.
    - _Action:_ a new ADR amends ADR-010. CloudWatch keeps AWS infrastructure.
11. **SMS through Clerk.** Clerk's SMS sign-in is limited to the US and Canada by default, and SMS
    in India needs DLT registration.
    - _Resolved:_ sign-in without SMS; MSG91 only for phone verification (FR-147).
12. **Numbers for inbound and outbound.** Promotional 140xx numbers are believed to be
    outbound-only, so inbound calls and a Lead's return calls need other numbers.
    - _Resolved:_ the product separates the two kinds of number (FR-139, RK-17, VQ-13).

## 17. Questions for providers and counsel

These are facts, not choices. Each must be confirmed before the gate named.

| ID    | Question                                                                                                                                                                             | Ask                | Gate               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------ |
| VQ-1  | Does Exotel support AI streaming (Voicebot) on **outbound** calls? What is its voice DLT, 140xx/1601xx provisioning and A2P declaration handling, and what is its telemarketer role? | Exotel             | Telephony epic     |
| VQ-2  | Can Exotel transfer a call while the stream is live? What are its latency and ringback behaviour, and can it whisper to the destination?                                             | Exotel             | Handoff epic       |
| VQ-3  | Must Nivomi register as a telemarketer or aggregator? Is Nivomi a processor or a fiduciary? Is an AI call A2P?                                                                       | Counsel            | Phase B            |
| VQ-4  | Does the 7-day inquiry "Relationship" allow promotional calls to DND-registered numbers?                                                                                             | Counsel            | Phase B            |
| VQ-5  | Will Sarvam sign a DPA with no training, set retention, and keep processing in India?                                                                                                | Sarvam             | Phase B            |
| VQ-6  | Recording legality and sufficient notice; retention defaults per data class; does verbal consent satisfy DPDP?                                                                       | Counsel            | Phase B            |
| VQ-7  | Can Exotel or the operators feed complaints and spam flags to Nivomi? Is DND filtering on by default?                                                                                | Exotel             | Phase B            |
| VQ-8  | Does Exotel detect answering machines on outbound calls?                                                                                                                             | Exotel             | Voice epic         |
| VQ-9  | Sarvam streaming STT on code-mixed speech and on 8 kHz telephony audio, per language                                                                                                 | Spike              | Voice epic         |
| VQ-10 | HubSpot APIs and scopes for calls, notes, meetings, tasks, deals, the Leads object, webhooks and rate limits; which HubSpot plans allow them                                         | HubSpot docs       | CRM epic           |
| VQ-11 | Razorpay support for metered or add-on charges on subscriptions, and for GST-compliant invoices                                                                                      | Razorpay docs      | Billing epic       |
| VQ-12 | Gazette date of the Third Amendment                                                                                                                                                  | eGazette           | Rule Set v1 final  |
| VQ-13 | Can 140xx or 1601xx numbers receive inbound calls? Which number types does Exotel provision for inbound AI and for a Lead's return calls?                                            | Exotel, counsel    | Inbound epic       |
| VQ-14 | Which signals (logs, metrics, traces) does Grafana Cloud store in its India region, and what are retention and pricing?                                                              | Grafana docs       | Observability epic |
| VQ-15 | Clerk: authenticator-app MFA without SMS, and the terms for enabling India SMS                                                                                                       | Clerk docs         | Identity epic      |
| VQ-16 | Current pricing and limits for every provider (Exotel, Sarvam, LLM candidates, HubSpot API, Razorpay, MSG91, SES, Grafana)                                                           | Technical research | OD-4               |

**VQ-1 partly answered (2026-09-26).** Exotel's developer documentation describes an outbound AI
call API: `POST /v1/Accounts/{AccountSid}/Calls/connect` with `StreamUrl` and `StreamType`, and a
`TimeLimit` of up to 14,400 s. The questions about DLT, number series, the A2P declaration and the
telemarketer role are still open.

## 18. Assumptions index

The owner can accept or override each of these. Accepted assumptions become decisions in the
memlog.

Assumptions about mechanisms only (A-76 transfer-failure callback time, A-77 evaluation-set size,
A-78 pacing defaults) are in [addendum.md](addendum.md). Revision 2 adds A-79 to A-94.

| ID   | Assumption                                                                                                | Where        |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------ |
| A-1  | MVP uses the default Lead Status lifecycle; custom statuses post-MVP                                      | §7.2         |
| A-2  | 3–5 design-partner Organizations in Phase B                                                               | §7.4         |
| A-3  | New Organizations start `PENDING_APPROVAL` (controlled rollout)                                           | FR-1         |
| A-4  | Removed Members lose API access within 5 minutes                                                          | FR-2         |
| A-5  | MFA enforced for `SUPER_ADMIN`, `OWNER` and `ADMIN`; optional for other Roles                             | FR-5         |
| A-6  | 30-day grace period before a closed Organization's data is deleted                                        | FR-7         |
| A-7  | Permission matrix as drafted                                                                              | §8.1         |
| A-8  | Telecom expiry warnings 30 days ahead                                                                     | FR-12        |
| A-9  | Import limits of 20 MB and 100,000 rows per file                                                          | FR-14        |
| A-10 | Up to 50 custom fields per Organization                                                                   | FR-18        |
| A-11 | A manual status change beats an older AI outcome                                                          | FR-25        |
| A-12 | Approved knowledge of about 20,000 characters, no document retrieval                                      | FR-27        |
| A-13 | Qualification is computed by rules over answers, not by LLM judgement                                     | FR-28        |
| A-14 | Default maximum call duration of 5 minutes                                                                | FR-31        |
| A-15 | Test calls are metered                                                                                    | FR-33        |
| A-16 | List of data the AI Agent never requests                                                                  | FR-34        |
| A-17 | Continuous Campaigns are in the MVP                                                                       | FR-35        |
| A-18 | Retry defaults: 3 attempts, 4 hours apart, at most 2 a day                                                | FR-40        |
| A-19 | At most one connected sales call per Lead per day, across Campaigns                                       | FR-41        |
| A-20 | Emergency Stop halts dialling within 30 s and closes calls within 60 s                                    | FR-43        |
| A-21 | Complaint breaker at 2 complaints in 10 days, or any operator flag                                        | FR-49        |
| A-22 | Resuming after the breaker needs an `ADMIN` acknowledgement and Super Admin approval                      | FR-49        |
| A-23 | Opening starts within 1 s of answer                                                                       | FR-54, NFR-3 |
| A-24 | Barge-in stops playback within 300 ms                                                                     | FR-56, NFR-4 |
| A-25 | The AI Agent may switch to another allowed language mid-call                                              | FR-57        |
| A-26 | Recording is off by default                                                                               | FR-60        |
| A-27 | On voicemail, end without leaving a message                                                               | FR-62        |
| A-28 | Transcript ready within 2 minutes at p95                                                                  | FR-65        |
| A-29 | AI Summary of at most 150 words                                                                           | FR-68        |
| A-30 | AI Summary always in English                                                                              | FR-68        |
| A-31 | Low-confidence, complaint-risk and failed-transfer calls are queued for review                            | FR-72        |
| A-32 | Low confidence after 2 clarification attempts triggers a Handoff                                          | FR-74        |
| A-33 | A spoken whisper to the Human Agent only if the provider supports it                                      | FR-75        |
| A-34 | 25-second ring timeout for a Live Transfer                                                                | FR-76        |
| A-35 | No softphone; Human Agents make callbacks outside Nivomi                                                  | FR-77        |
| A-36 | Nivomi availability windows as the calendar fallback                                                      | FR-80        |
| A-37 | Calendar invitation to the Lead only if the provider supports it and email is known                       | §8.11        |
| A-38 | One CRM Connection per Organization                                                                       | FR-84        |
| A-39 | A HubSpot account cannot be connected to two Organizations                                                | FR-84        |
| A-40 | HubSpot's "Leads" object deferred; Leads map to contacts                                                  | FR-88        |
| A-41 | Unconnected attempts summarized, not logged one by one in HubSpot                                         | FR-89        |
| A-42 | HubSpot writes dead-lettered after 24 hours of retries                                                    | FR-93        |
| A-43 | Billable unit: connected minutes, rounded up per Call (pending OD-4)                                      | FR-98        |
| A-44 | Usage alerts at 80% and 100% of Included Usage                                                            | FR-100       |
| A-45 | GST-compliant invoices produced through Razorpay                                                          | FR-101       |
| A-46 | 7-day grace period on failed payment                                                                      | FR-102       |
| A-47 | Upgrades immediate and prorated; downgrades at period end                                                 | FR-103       |
| A-48 | Daily billing reconciliation                                                                              | FR-104       |
| A-49 | Dashboard freshness: 60 s for counts, 5 minutes for aggregates                                            | FR-106       |
| A-50 | Export links expire after 24 hours                                                                        | FR-110       |
| A-51 | Support Access Grants last 24 hours by default                                                            | FR-114       |
| A-52 | Two-person Rule Set approval is post-MVP                                                                  | FR-116       |
| A-53 | Draft retention defaults (addendum)                                                                       | FR-121       |
| A-54 | Nivomi does not delete from the tenant's HubSpot on erasure                                               | FR-123       |
| A-55 | Evaluation data only from Organizations that opt in                                                       | FR-124       |
| A-56 | Turn latency at most 1.5 s at p50 and 2.0 s at p90                                                        | NFR-1        |
| A-57 | 99.5% availability target in Phase B                                                                      | NFR-7        |
| A-58 | Platform-caused call failures below 2%                                                                    | NFR-8        |
| A-59 | Recovery point 15 minutes, recovery time 4 hours                                                          | NFR-10       |
| A-60 | Phase B capacity: 50 concurrent calls, 10 per Organization, 30,000 calls a month                          | NFR-12       |
| A-61 | A 100,000-row import completes in 10 minutes                                                              | NFR-14       |
| A-62 | External penetration test before Phase C                                                                  | NFR-23       |
| A-63 | Platform default is not India-only processing                                                             | NFR-27       |
| A-64 | English web interface for the MVP                                                                         | NFR-34       |
| A-65 | Desktop-first responsive web app, no mobile app                                                           | NFR-35       |
| A-66 | WCAG 2.1 AA target                                                                                        | NFR-37       |
| A-67 | Monthly regulatory re-check until Phase C                                                                 | CR-14        |
| A-68 | Conversation completion at least 85%                                                                      | SM-2         |
| A-69 | HubSpot sync success at least 99% within 15 minutes                                                       | SM-3         |
| A-70 | Cost variability (coefficient of variation) at most 15%                                                   | SM-5         |
| A-71 | Qualification, intent, entity and escalation accuracy at least 90%                                        | SM-6/7/9/10  |
| A-72 | Appointment extraction accuracy at least 98%                                                              | SM-8         |
| A-73 | Barge-in success at least 95%                                                                             | SM-13        |
| A-74 | Side-effect alert thresholds as drafted                                                                   | §12          |
| A-75 | Usage totals match provider records within 1%                                                             | AC-1 #21     |
| A-79 | One open Lead per Contact at a time; the exact Contact, Lead and Company model is settled in architecture | §5           |
| A-80 | Bounded transfer retry: at most 2 destinations                                                            | FR-76        |
| A-81 | A callback expires 24 hours after the agreed time if nobody works it                                      | FR-77        |
| A-82 | Telephony provider plays a pre-recorded message when no TTS works                                         | FR-133       |
| A-83 | Scheduled CRM sync every 15 minutes                                                                       | FR-137       |
| A-84 | For shared fields, the latest change wins and history is kept                                             | FR-138       |
| A-85 | An inbound call is an `INQUIRY` Consent Basis, with the call as evidence                                  | FR-142       |
| A-86 | Clerk sends its own authentication emails                                                                 | FR-146       |
| A-87 | OTP: 5-minute expiry, 5 attempts, 30-second resend cooldown                                               | FR-147       |
| A-88 | Sign-in uses email plus authenticator MFA, with no SMS                                                    | FR-147       |
| A-89 | In-app notifications, plus email where enabled                                                            | FR-148       |
| A-90 | Grafana Cloud stack in its India region; long-term log archive in S3 in Mumbai                            | NFR-32       |
| A-91 | Nivomi provisions numbers for each Organization                                                           | OD-2         |
| A-92 | Inbound and outbound minutes metered the same way until OD-4                                              | OD-4         |
| A-93 | Uploaded files deleted 30 days after import                                                               | FR-128       |
| A-94 | Signed upload URLs expire after 15 minutes                                                                | FR-128       |
