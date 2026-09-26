---
title: 'Nivomi AI MVP PRD — Addendum'
status: draft
created: '2026-09-26'
updated: '2026-09-26'
---

# Nivomi AI MVP PRD — Addendum

This file holds detail that downstream work (`bmad-ux`, `bmad-architecture`, epics) needs but that
would clutter the PRD's requirements: mechanisms, default tables and options under consideration.
The PRD ([prd.md](prd.md)) governs if the two disagree. Provider facts here come from the
[India compliance research](../../research/domain-india-ai-outbound-calling-compliance-2026-09-25/research.md)
(2026-09-25) or are marked **unverified**. Every provider detail must be re-checked against
current official documentation before implementation (CLAUDE.md).

## 1. Target architecture (owner's conceptual view, 2026-09-26)

```
Multi-tenant Nivomi
├── Auth / Organizations (Clerk + Nivomi RBAC)
├── AI Agents
├── Campaigns
├── ComplianceEngine (Rule Sets as data)
├── VoiceProvider ─── Exotel
├── STTProvider ───── Sarvam
├── TTSProvider ───── Sarvam
├── LLMProvider ───── configurable model(s) via LLMRouter
├── CRMProvider ───── HubSpotAdapter
├── CalendarProvider ─ (OD-1)
├── PaymentProvider ── RazorpayAdapter
├── Usage / Billing
├── Analytics
├── Audit
├── PostgreSQL · Redis / queue · object storage
└── AWS ap-south-1 infrastructure
```

`CalendarProvider` is new relative to CLAUDE.md and ARCHITECTURE.md. Add it, with an ADR, during
`bmad-architecture` (PRD §16.3, item 5).

## 2. Live Transfer mechanism (FR-75, FR-76)

The research (§4.1) found:

- Exotel documents human handoff **only after** the bot closes the audio stream: the call flow
  moves on to a Passthru applet and then Connect or SIP.
- Transfer during a live stream is not documented, and ringing audio leaks into the stream (a
  known issue).
- Outbound Voicebot use is not documented. The guide is in Beta.

The design that follows:

1. The AI Agent decides to hand off and tells the Lead.
2. The voice worker records the transfer intent (the destination and a context snapshot) in
   Nivomi.
3. The worker closes the stream normally.
4. The provider's flow continues to a Connect step that dials the Transfer Destination. Ringback
   or hold audio comes from the provider, not the AI.
5. The provider's status callbacks update the transfer events (`answered`, `failed`) on the Call
   timeline.
6. **On failure** there is no AI left on the line. A pre-configured message, played by the
   provider, offers a callback. The callback time is either:
   - captured before transfer ("if nobody is free, when should we call back?"), or
   - set to the next slot within business hours [ASSUMPTION A-76, addendum only].
7. The Human Agent's context (FR-75) comes from Nivomi's web app, not from the telephony channel.

If Exotel confirms mid-stream transfer (VQ-2), the flow can keep the AI on the line until the
destination answers. That is a mechanism upgrade and changes no requirement.

## 3. Calendar provider options (OD-1)

**Unverified.** This comparison comes from general knowledge, not from this run's research. Use it
only to frame a spike; check current APIs before deciding.

| Consideration       | HubSpot Meetings                                                                  | Google Calendar                                   | Microsoft (Outlook/365)                             |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Integration effort  | Reuses the HubSpot OAuth the MVP already requires; one integration                | A second OAuth app; per-user or domain-wide grant | A second OAuth app (Entra ID); tenant admin consent |
| Availability source | Meeting links draw on the rep's connected calendar                                | Free/busy on each rep's calendar                  | Free/busy through calendar APIs                     |
| Customer fit        | Teams already living in HubSpot (every MVP tenant)                                | Google Workspace teams                            | Microsoft 365 teams                                 |
| Risks to check      | Whether booking through the API is supported; HubSpot plan and seat needs; scopes | Verification of sensitive scopes by Google        | Admin-consent friction for SMBs                     |

**Suggested approach.** Run a 1–2 day spike on HubSpot Meetings first, because it reuses the
existing connection. Fall back to Nivomi availability windows (FR-80) for the MVP if booking
through the API is limited. Add Google or Microsoft next, according to what the design partners
use.

## 4. Default Conversation Outcome → Lead Status mapping (FR-70)

| Conversation Outcome                          | Lead Status                                           | HubSpot (default mapping, FR-87)              |
| --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `INTERESTED` + Qualification `QUALIFIED`      | `QUALIFIED`                                           | Lead status property; deal if enabled (FR-91) |
| `INTERESTED` + `NOT_QUALIFIED` / `INCOMPLETE` | `INTERESTED`                                          | Lead status property                          |
| `APPOINTMENT_BOOKED`                          | `APPOINTMENT_BOOKED`                                  | Meeting; deal if enabled                      |
| `CALLBACK_REQUESTED`                          | `CALLBACK_REQUESTED`                                  | Task                                          |
| `TRANSFERRED`                                 | `CONNECTED` (the Human Agent records the next status) | Call and note                                 |
| `TRANSFER_FAILED`                             | `CALLBACK_REQUESTED`                                  | Task                                          |
| `NOT_INTERESTED`                              | `NOT_INTERESTED`                                      | Lead status property                          |
| `OPTED_OUT`                                   | `DO_NOT_CALL`                                         | Do-not-call property (per mapping)            |
| `WRONG_NUMBER`                                | `CLOSED`                                              | Note                                          |
| `LANGUAGE_UNSUPPORTED` / `INCOMPLETE`         | `CONNECTED` (retry per policy)                        | Call                                          |
| No connection (`NO_ANSWER`, `BUSY`, `FAILED`) | `ATTEMPTED`; `UNREACHABLE` after the final attempt    | Summarized on the contact (FR-89)             |

## 5. Draft retention matrix (FR-121) — for counsel review (VQ-6)

Inputs:

- **DPDP Rule 8(3):** at least 1 year of personal data, traffic data and processing logs.
- **CERT-In:** ICT logs for 180 days in India.
- **CCPA draft:** consent and opt-out records for 180 or 365 days.
- **Exotel defaults:** recordings 90 days, call records 1 year.

All values below are **[ASSUMPTION A-53]**.

| Data class                                       | Default                                                                       | Bounds (Rule Set)      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------- |
| Recordings                                       | 1 year                                                                        | Minimum set by counsel |
| Transcripts, AI Summaries, qualification answers | 1 year after the last Lead activity                                           | ≥ 1 year               |
| Call metadata, Eligibility Decisions             | 2 years                                                                       | ≥ 1 year               |
| Consent ledgers, Suppression List (hashed)       | Consent: 2 years after expiry or revocation; suppression: indefinite          | ≥ 1 year               |
| Audit Events                                     | 2 years                                                                       | ≥ 1 year               |
| Application / ICT logs                           | 1 year (≥ 180 days in India)                                                  | ≥ 180 days             |
| Provider-side copies (Exotel recordings, Sarvam) | Shortest the provider allows; deleted after transfer to Nivomi where possible | Per DPA                |

## 6. LLM residency options (NFR-6, NFR-27)

From the research (§4.3, 2026-09-25):

- Claude has no India-only inference, either on Bedrock or through the Anthropic API.
- OpenAI GPT-5.6 on Bedrock has an `in.` profile that routes only between Mumbai and Hyderabad.
- The OpenAI API offers India data residency through sales only.
- Azure South India is regional for older models only.
- Vertex AI in `asia-south1` is listed for the Gemini 2.x generation (low confidence).

The evaluation must record each candidate's residency along with its quality, latency and cost.
The platform default does not need to be India-only (A-63), but the router must be able to meet
a per-Organization India-only policy.

## 7. Evaluation set for the default LLM and the accuracy metrics (NFR-6, SM-6 to SM-13)

- **Size and mix:** at least 50 scripted and at least 50 real (design-partner, opted-in) calls per
  language [ASSUMPTION A-77, addendum only]. The set covers code-mixed speech, noisy lines,
  interruptions, objections, out-of-knowledge questions, opt-outs, human requests and booking
  edge cases (relative dates, "next Saturday", Indian time expressions).
- **Labels:** each call has gold labels for outcome, interest, qualification answers, appointment
  fields and whether escalation was warranted.
- **Re-runs:** the set is re-run on every model, prompt-guardrail or provider change. Results are
  stored per Agent Version.

## 8. Pacing and anti-flagging defaults (CR-8)

Operator spam detection keys on high distinct-number volume, short average duration and a low
ratio of incoming to outgoing calls (research §1.6). Suggested starting values
[ASSUMPTION A-78, addendum only]:

- at most 10 concurrent calls per Organization;
- a ramp for new Caller Numbers: at most 100 dials per number on day 1, rising gradually;
- an alert when a Campaign's average connected duration falls below 20 s;
- the breaker from FR-49.

Tune these in Phase B.

## 9. Owner-supplied context kept for downstream use

- **Typical customer workload:** hundreds to a few thousand leads a month; several
  representatives; follow-up today through calls, spreadsheets, CRM tasks and individual
  representatives. Missed and delayed follow-up is the main pain.
- **Example verticals:** real estate, education and coaching, BFSI and insurance where legally
  permitted, automotive, local high-consideration services. The first vertical is **not** locked.
- **Owner's launch philosophy:** production-grade architecture + controlled initial rollout +
  real-world measurement + iteration. Build no enterprise complexity before evidence requires it.
