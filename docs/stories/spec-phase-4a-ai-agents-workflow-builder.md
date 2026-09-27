---
title: 'Phase 4a: AI Agents, conversation workflow builder, versions and test chat'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'build'
baseline_commit: 'c8f23a1'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-022-ai-agents-and-conversation-workflows.md'
  - '{project-root}/docs/decisions/ADR-011-voice-pipeline-providers.md'
---

## Intent

**Problem.** Campaigns (Phase 3) dial, but there is no AI Agent to say anything. PRD §8.5
(FR-26–FR-34) defines what an agent is; the owner asked for a builder like Dograh's (an
open-source voice-agent platform, used as a **feature reference only** — owner decision
2026-09-27): a visual conversation workflow, browser testing and published versions.

**Approach.** Build the agent layer on our own stack (NestJS, Next.js, PostgreSQL), provider-free:

1. **AI Agents** (FR-26) with persona, company, languages, voice, purpose, call category, call
   limits (FR-31), escalation settings (FR-29), approved knowledge and objection guidance (FR-27)
   and a tool allowlist from a platform tool registry.
2. **Conversation workflow** — a typed node graph (start, question, agent, handoff, end) with
   deterministic transitions, edited in a **visual builder** (React Flow) and validated on the
   server.
3. **Deterministic qualification** (FR-28): rules over typed answers, never an LLM judgement.
4. **Platform guardrails** (FR-34) and the **mandatory opening** (FR-27: AI disclosure, business
   identity, purpose, recording notice) inserted by a prompt compiler; tenants cannot remove them.
5. **Versions** (FR-32): publishing freezes an immutable Agent Version; campaigns pin one; every
   call attempt records it.
6. **Test chat** in the browser (Dograh's "Test Chat"): a conversation engine walks the workflow,
   using an `LLMProvider` for free-form turns. Until an LLM vendor is chosen (open item in the
   status file) the provider is a **simulated** one, refused in production.

Out of scope here (later phases): live voice and browser audio test (needs STT/TTS, Phase 4b),
test calls to a verified phone (FR-33 needs Exotel and phone OTP), appointment booking (Phase 6),
document knowledge bases (the PRD MVP has none — A-12), business-automation workflows
(Trigger → Condition → Action, from the MVP mock-up).

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | `ai_agents`, `agent_versions`, `agent_test_sessions` are tenant-owned (`organization_id`). The guardrail text and tool registry are platform-owned code/data.                                                              |
| Source of truth          | The agent row holds the editable **draft**; `agent_versions` holds immutable published snapshots (a trigger rejects `UPDATE`). Campaigns and attempts reference a version id, never the draft.                             |
| Authorization and audit  | New permissions `agents.read` (OWNER, ADMIN, MANAGER, ANALYST — "AI Agents R" for ANALYST) and `agents.manage` (OWNER, ADMIN, MANAGER), per PRD §8.1. Create, update, publish, archive and test-session start are audited. |
| Provider failure         | The LLM call in a test chat fails with `PROVIDER_ERROR` for that turn; the session keeps its state and the Member can retry. The engine never lets a provider answer skip guardrails: the compiler always applies them.    |
| Duplicate delivery       | Publishing is serialized per agent (row lock) and versions are unique `(agent_id, version)`. A test-chat turn carries the expected turn number; a replayed turn returns the stored reply instead of advancing twice.       |
| Worker crash / DB outage | Test chat is synchronous and short; state is committed per turn. Nothing runs in the background in this slice.                                                                                                             |
| Usage and cost           | The simulated LLM costs nothing. The `LLMProvider` interface returns token counts so real adapters can be metered per turn (Phase 8); test sessions are marked as tests (FR-33).                                           |
| 100× scale               | Agents and versions are small documents (workflow ≤ 200 nodes, knowledge ≤ 20,000 characters). Test sessions expire after 24 hours and are bounded to 60 turns.                                                            |

## Acceptance

- Unit tests: workflow validation, qualification rules, answer parsing, intent detection
  (opt-out and human request always win), prompt compiler (guardrails and opening always present),
  conversation engine paths.
- Integration tests: agent CRUD and permissions, publish/versions immutability, campaign pinning
  and launch requiring a published version with a matching call category, attempts recording the
  version, test chat end to end, cross-tenant isolation.
- Web: agents list, agent editor (settings, visual workflow builder, publish, versions), test chat.
- e2e: create an agent, add a question in the builder, publish, chat with it.
- ADR-022, API docs, requirements matrix and status updated; seed has a demo agent; verify green.
