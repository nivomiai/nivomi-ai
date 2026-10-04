# ADR-025: Appointments — calendar provider seam and tenant-owned scheduling

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-017 (Nivomi domain is authoritative), ADR-022 (`AGENT_TOOLS.appointment.book`
  — reserved slot), ADR-023/024 (live calls)

## Context

PRD lists appointment booking as an MVP agent capability (`callback.schedule` is already an
agent tool). We need to decide: do we own the calendar, or do we integrate with the tenant's
(Google Calendar, Microsoft 365)? If we integrate, we need per-user OAuth; if we own, we need
to render availability. OD-1 ("calendar") is still open with the owner.

## Decision

### 1. Nivomi owns the appointments domain; calendar sync is an **optional outbound integration**

- `appointments` (tenant-owned) holds the authoritative row: `organization_id`, `lead_id`,
  `assignee_user_id` (Member handling the appointment), `starts_at`, `duration_minutes`,
  `channel` ('CALL' | 'IN_PERSON' | 'VIDEO'), `location_text`, `notes`, `status`
  ('SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'), `source`
  ('AI_CALL' | 'MANUAL' | 'INBOUND' | 'IMPORT'), `created_at`.
- `appointment_slots` (tenant-owned) defines availability: `(organization_id, user_id,
day_of_week, starts_at_minutes, ends_at_minutes, timezone, effective_from, effective_to)`.
  Phase 6 reads these to decide what the agent can offer; the UI is a simple weekly editor.

### 2. New seam: `CalendarProvider`

- `createEvent({appointmentId, starts, duration, title, description, invitees})` →
  `{externalId}`; `updateEvent`, `cancelEvent`; `freeBusy(users, from, to)` →
  `{busy: Interval[]}`.
- `GoogleCalendarProvider` and `Microsoft365CalendarProvider` are deferred adapter PRs
  (depend on OAuth apps; TECH_DEBT entry).
- `SimulatedCalendarProvider` for dev: records creates/updates/cancels in memory; `freeBusy`
  returns empty so the agent can always book.
- Appointments are written to the database first; the calendar event is enqueued as an outbox
  job that calls the provider. CRM-style failure never fails the business event (CLAUDE.md).

### 3. Agent tool `appointment.book(leadId, startsAt, durationMinutes, channel)`

Registered in `AGENT_TOOLS`:

- side effect: writes an `appointments` row (status SCHEDULED), enqueues `calendar.sync`
- audit: true
- timeout: 3_000 ms
- scope: tenant of the call
- validation: `startsAt` must be within an open `appointment_slot` for the assignee (round-robin
  among the organization's AGENT role members unless the lead has an `assignee_user_id`)

### 4. Rescheduling and cancellation

- The lead's call-attempt record points at the appointment id; a later call that reschedules
  issues `appointment.reschedule(id, newStartsAt)`.
- A cancellation writes a `CANCELLED` row; the calendar sync job emits `cancelEvent`.

### 5. Permission + API

- `appointments.read` (OWNER, ADMIN, MANAGER, AGENT, ANALYST, VIEWER)
- `appointments.manage` (OWNER, ADMIN, MANAGER, AGENT)
- `GET /api/v1/appointments`, `POST /api/v1/appointments`, `PATCH /api/v1/appointments/:id`,
  `DELETE /api/v1/appointments/:id`, `GET /api/v1/appointments/availability?from&to&users`.

## Consequences

- The agent can book calls and in-person appointments against member availability on day one,
  without any external calendar integration.
- Calendar integration is additive, per-user, and never blocks the agent flow.
- Deferred: calendar push notifications, invitee reminders (Phase 9 notifications), timezone UX
  polish (one timezone per org for Phase 6; per-user later).
