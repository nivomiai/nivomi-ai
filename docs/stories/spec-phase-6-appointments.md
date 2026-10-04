---
title: 'Phase 6: Appointments — slots, booking agent tool, calendar provider seam'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-025-appointments.md'
---

## Intent

**Problem.** The AI agent can qualify but not commit the conversation to a next action. Phase 6
lets the agent book an appointment with a Member against their declared availability, writes
it to the Nivomi database, and syncs to the Member's calendar when a per-user calendar
integration is connected (deferred adapter).

**Approach.** Per ADR-025:

1. New tables: `appointments`, `appointment_slots`, `calendar_links` (per-user OAuth stubs).
2. `AppointmentsService` with create/reschedule/cancel; emits a `calendar.sync` job (outbox).
3. New agent tool `appointment.book` registered in `AGENT_TOOLS`.
4. `CalendarProvider` interface + `SimulatedCalendarProvider`.
5. Web `/app/appointments` list + detail; weekly slot editor at `/app/team/me/availability`.

Out of scope: Google / Microsoft 365 adapter implementations (OAuth apps are external
dependencies); invitee emails (Phase 9); recurring appointments.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | All three tables are tenant-owned (`organization_id`). `assignee_user_id` must belong to the tenant.                               |
| Source of truth          | Nivomi `appointments` row is authoritative; the calendar event is a shadow (ADR-017 analogue).                                     |
| Authorization and audit  | `appointments.read` / `appointments.manage` permissions. Every create/reschedule/cancel audited (including when done by an agent). |
| Provider failure         | Calendar sync job retries with backoff; failures surface in audit but never fail the appointment write.                            |
| Duplicate delivery       | Agent tool call carries the call id; the write is unique on `(call_session_id, lead_id)` to avoid two bookings per call.           |
| Worker crash / DB outage | Calendar jobs are at-least-once; the provider's `createEvent` is upserted on `appointmentId` so a replay is a no-op.               |
| Usage and cost           | None extra; the agent tool call is metered under the call's tokens (Phase 8).                                                      |
| 100× scale               | Availability lookup is O(members × slots per week), typically < 1000 rows per org; indexed on `(organization_id, user_id)`.        |

## Acceptance

- Migration `0005_appointments.sql` with FKs and indexes.
- `AppointmentsService` create/reschedule/cancel with unit tests (idempotency on `call_session_id`).
- `appointment.book` tool call integration test from a conversation.
- `CalendarProvider` interface + `SimulatedCalendarProvider` + unit tests.
- Web `/app/appointments` list + detail; availability editor.
- `npm run verify` green.

## Deferred to adapter PRs

- Google Calendar and Microsoft 365 adapters (OAuth apps on hold with the HubSpot / AWS hold).
- Invitee reminder emails/SMS (Phase 9).
