# ADR-028: Notifications, OTP, Super Admin console, MFA

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-015 (SES + MSG91 provider choice), ADR-018 (Nivomi-owned auth), ADR-019
  (jobs)

## Context

Phase 9 covers four closely linked gaps:

1. **Notifications** — tenants need email alerts (quota warnings, campaign complete, HubSpot
   deauth, invoice issued) and operational owners need platform notifications (new signup,
   complaint-breaker tripped). A single notification service rather than ad-hoc `emailProvider.send`
   calls.
2. **OTP** — phone verification (TelecomIdentity, FR-9) and MFA step-up need SMS OTPs.
3. **Super Admin console** — Phases 2–8 added `/platform` APIs. Phase 9 ships the web UI.
4. **MFA** — PRD FR-5 requires TOTP for owner/admin accounts; still TECH_DEBT.

## Decision

### 1. `NotificationService` + `notification_definitions` catalogue

```ts
NotificationService.send(organizationId, { kind: 'quota.warn.90', payload: { … } });
```

- `notification_definitions` (platform-owned): `kind`, `channel` ('EMAIL' | 'SMS' | 'IN_APP'),
  `subject_template`, `body_template`, `audience` ('OWNERS' | 'ADMINS' | 'ALL_MEMBERS' | 'SPECIFIC_USER'),
  `locale_default` ('en' | 'hi' | …).
- `notification_dispatches` (tenant-owned): one row per rendered + sent notification; join
  from the audit log.
- Templates are **owned by the platform** (CLAUDE.md: operational settings in DB/Super Admin,
  not source) and edited in `/platform/notifications/templates`.
- Users opt-out of a kind through `notification_preferences` (per-user).

### 2. OTP: `OtpProvider` seam (ADR-015 names MSG91)

```ts
interface OtpProvider {
  send(request: {
    phoneE164: string;
    purpose: 'telecom_verify' | 'mfa_step_up' | 'login_otp';
    locale: string;
    codeDigits: 4 | 6;
  }): Promise<{ requestId: string }>;
  verify(request: { requestId: string; code: string }): Promise<{ ok: boolean }>;
}
```

`Msg91OtpProvider` is the production adapter; `SimulatedOtpProvider` reflects the code back in
the dev-mailbox-style "dev OTP tray" (behind a Super Admin feature flag).

### 3. Super Admin console (Phase 9 UI for the `/platform/*` APIs built in earlier phases)

Routes under `/platform/*`, gated by `SUPER_ADMIN`:

- `/platform/organizations` (list, approve, suspend)
- `/platform/organizations/:id` (detail: plan, usage, members, audit, caller numbers,
  complaint breaker)
- `/platform/users` (list, impersonate off / on — impersonation audited heavily)
- `/platform/plans`
- `/platform/notifications/templates`
- `/platform/compliance/rule-sets` (view only; `APPROVED` version lives in migrations)
- `/platform/health` (job queue depth, DLQ, rate-limiter state)

### 4. MFA (TOTP) for owners and admins

- `user_mfa` table: `user_id`, `method` ('TOTP'), `secret_encrypted`, `recovery_codes_encrypted`,
  `enrolled_at`, `last_used_at`.
- Enrollment flow: QR + 6-digit confirmation; recovery codes shown once.
- Enforcement:
  - OWNER and ADMIN roles **must** have MFA enabled; `AuthService.login` challenges on
    missing MFA with a one-time 24-hour grace, then fails closed.
  - MANAGER / AGENT / ANALYST / VIEWER: optional; organization can enforce via a flag.
  - Super Admin: hard required; no grace.
- Step-up for sensitive actions (impersonation, platform plan change, Super Admin promotion).

TECH_DEBT: `AuthService.split-into-identity-and-session` (already tracked) lands with this
phase.

## Consequences

- A single pipe for all notifications → fewer bespoke email call sites, uniform audit.
- MFA closes a PRD gap (FR-5) and makes impersonation safe.
- Super Admin UI makes platform operations usable without touching the database.
- Deferred: WhatsApp notifications, push notifications, SSO/SCIM for the enterprise plan.
