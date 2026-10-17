---
title: 'Phase 9: Notifications, OTP seam, Super Admin UI, MFA'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-028-notifications-otp-superadmin-mfa.md'
---

## Intent

**Problem.** Multiple PRD gaps converge here: no email templates/pipe, no OTP, no Super Admin
console, no MFA (FR-5). Phase 9 ships all four so the platform is operable from the browser and
owner/admin accounts are protected.

**Approach.** Per ADR-028:

1. `NotificationService` + `notification_definitions` + `notification_dispatches` +
   `notification_preferences`.
2. `OtpProvider` seam + `SimulatedOtpProvider` + stubbed `Msg91OtpProvider` (adapter PR).
3. Super Admin console pages for the `/platform/*` APIs already built in Phases 2–8.
4. MFA (TOTP) with enrollment, enforcement for OWNER/ADMIN/SUPER_ADMIN, step-up for sensitive
   actions, recovery codes.
5. Split `AuthService` → `IdentityService` + `SessionService` (TECH_DEBT closes).

Out of scope: SSO/SCIM, WhatsApp, push notifications, hardware-token MFA.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data owner and tenant    | `notification_dispatches`, `notification_preferences`, `user_mfa` are tenant/user-owned; `notification_definitions` is platform-owned.           |
| Source of truth          | DB. OTP secrets never leave the server; TOTP secrets encrypted at rest with the credential key (TECH_DEBT: move to KMS envelope at Phase 11).    |
| Authorization and audit  | `notifications.manage` (platform SUPER_ADMIN) for templates. MFA enrollment is per-user, audited. Impersonation step-up requires fresh MFA code. |
| Provider failure         | Email/OTP send goes through outbox (ADR-019); failures retried then DLQ. Login never blocks on a notification send.                              |
| Duplicate delivery       | Notifications idempotent on `(organization_id, kind, source_entity_id)`. OTP: previous unused codes invalidated on new send.                     |
| Worker crash / DB outage | Login flow is request-scoped; MFA challenge persists in the auth session until completed. Notifications queue up and resume.                     |
| Usage and cost           | SMS and email metered (`SMS_SENT` already defined in ADR-027; add `EMAILS_SENT`). Super Admin notifications bypass tenant quotas.                |
| 100× scale               | Templates render per dispatch (< 1 ms); the outbox absorbs bursts. MFA table scales with user count only (small).                                |

## Acceptance

- Migration `0008_notifications_mfa.sql`: four tables + user_mfa.
- `NotificationService.send` integration test covering render + outbox + delivery audit.
- `OtpProvider` + `SimulatedOtpProvider` + verify-TelecomIdentity integration test.
- MFA enrollment + enforcement unit + integration tests (grace period, step-up, lockout).
- Super Admin UI pages behind `SUPER_ADMIN`; smoke test navigation and plan assignment.
- `AuthService` refactored into `IdentityService` + `SessionService`; all existing tests pass.
- `npm run verify` green.

## Deferred to adapter PR

- `Msg91OtpProvider` once account + DLT SMS template are provisioned.
- `SesEmailProvider` already defined in ADR-015; shares the hold with AWS.
