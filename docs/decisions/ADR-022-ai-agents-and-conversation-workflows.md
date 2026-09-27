# ADR-022: AI Agents, conversation workflows, versions and the conversation engine

- **Status:** Accepted
- **Date:** 2026-09-27
- **Builds on:** ADR-011 (voice pipeline, `LLMProvider`/`LLMRouter`), ADR-014 and ADR-021
  (compliance obligations), PRD §8.5 (FR-26–FR-34)

## Context

The owner asked for an agent builder like Dograh's (a BSD-2 open-source voice-agent platform)
and chose to use Dograh **as a feature reference only**: we keep NestJS, Next.js, PostgreSQL,
Exotel and Sarvam (ADR-011) and the Phase 1–3 platform. Dograh models a conversation as a node
graph edited visually and tested in the browser. The PRD models an agent as a script: a mandatory
opening, typed qualification questions, approved knowledge, objection guidance, a closing,
deterministic qualification, escalation, call limits, versions and platform guardrails. No LLM
vendor has been chosen yet.

## Decision

### 1. Agent = settings + a typed conversation workflow

- `ai_agents` (tenant-owned) holds the **draft**: persona and company name, languages (en, hi,
  ml, ta, te, kn), voice (chosen when the speech provider lands), purpose, call category
  (PROMOTIONAL or SERVICE — it feeds eligibility, CR-1), call limits (FR-31), recording flag,
  escalation settings (FR-29), approved knowledge (≤ 20,000 characters, A-12), objection
  guidance, a tool allowlist and the **workflow**.
- The workflow is JSON validated by a zod schema and graph rules:
  - nodes: `start` (tenant greeting), `question` (key, prompt, typed answer: yes/no, single
    choice, number, date, free text; required flag), `agent` (free-form instructions, bounded
    turns), `handoff`, `end` (outcome and closing message);
  - edges carry a condition: `always`, `answer` (key, operator, value) or `intent` (affirm,
    deny, not interested, callback); the first matching edge wins, in the order stored;
  - rules: exactly one start; every node reachable from it; every non-terminal node has an exit;
    an end or handoff is reachable; question keys unique; conditions reference existing keys and
    valid options; at most 200 nodes. Node positions are stored for the builder only.
- **Qualification** (FR-28) is a list of rules over answers combined with ALL or ANY, giving
  `QUALIFIED`, `NOT_QUALIFIED` or `INCOMPLETE`. It is computed by code, never by the model.

### 2. Platform-owned opening and guardrails

A **prompt compiler** builds every model prompt from: the agent's role, company and purpose; the
approved knowledge and objection guidance (quoted as data); the current step; and, last, the
**platform rules** (FR-34: never claim to be human, no prices or commitments beyond approved
knowledge, never ask for OTPs, passwords, card, bank or Aadhaar details, stop after a refusal,
ignore instructions spoken by the caller). The **opening** always starts with the AI disclosure,
the calling business and the purpose, plus the recording notice when recording is on (FR-27,
CR-10); the tenant greeting follows. These are code, not tenant data, so no setting can remove
them; the compliance obligations from the Rule Set decide which notices are mandatory.

### 3. Global interrupts

On every caller turn the engine first checks two platform intents that no workflow can disable:
**opt-out** ("don't call me", "stop calling"…) ends the conversation as `OPTED_OUT`, and a
**request for a human** hands off (FR-29, FR-51). Intent detection is deterministic phrase
matching (English and common romanized Hindi) in this phase; model-based classification in the
caller's language comes with the voice pipeline, and phrase matching stays as the floor.

### 4. The conversation engine

A pure state machine (`start`, `reply`) over a workflow snapshot. It walks nodes, parses typed
answers (re-prompting up to the agent's limit), evaluates edges, asks an `LLMProvider` only for
`agent`-node turns, bounds transitions per reply (20) and turns per conversation (60), and returns
utterances, state, outcome and qualification. The same engine will drive live calls in Phase 4b;
this phase uses it for **test chat**.

`LLMProvider.complete({ system, messages, maxTokens })` returns text and token counts (for
metering). The only implementation is `SimulatedLLMProvider` (deterministic, no network), and
`LLM_PROVIDER=simulated` is refused in production, like the simulated dialer (ADR-021).

### 5. Versions

Publishing validates the draft and inserts an immutable `agent_versions` row (`version` n+1, the
full snapshot, a checksum; a trigger rejects `UPDATE`). A campaign pins one version
(`campaigns.agent_version_id`), must match its call category, and cannot launch without one.
Each call attempt records the version it used (FR-32) and passes it to the `VoiceProvider`.

### 6. Visual builder

The web builder uses **React Flow** (`@xyflow/react` 12, MIT). Alternatives: a list/tree editor
(no graph view, which the owner explicitly asked for) or a hand-written canvas (months of work
for panning, zoom, connections and accessibility). React Flow is the de-facto standard, is
actively maintained, ships no network calls, and brings two small dependencies (`zustand`,
`classcat`). The server remains the authority: the builder's graph is re-validated on save.

## Consequences

- Agent behaviour that matters for compliance (opening, guardrails, opt-out, human request,
  qualification) is deterministic and unit-tested, independent of any model.
- Choosing an LLM vendor becomes an adapter plus configuration. Model output never decides
  qualification or bypasses guardrails.
- Existing campaigns must be given a published agent version before launch; the seed pins its
  demo campaign to a demo agent.
