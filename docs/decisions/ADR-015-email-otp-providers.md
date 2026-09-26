# ADR-015: Amazon SES for email, MSG91 for OTP

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

Nivomi needs to send transactional email: invitations, integration and sync alerts, billing
notices, usage alerts and reports. It also needs to verify phone numbers it will call, such as a
Member's own number for test calls or a Transfer Destination. Clerk already handles sign-in, and
sends its own authentication emails.

## Decision

- **Email:** `EmailProvider` interface, with Amazon SES as the first adapter, in ap-south-1 (SES is
  available in Mumbai: AWS SES endpoints reference, checked 2026-09-26).
  - Sending domains use SPF, DKIM and DMARC.
  - Bounce and complaint notifications feed a suppression list.
  - Sends are idempotent (keyed by a message ID) and retried.
- **OTP:** `OtpProvider` interface, with MSG91 as the first adapter. OTPs:
  - are hashed, never stored in plain text, and never logged;
  - expire;
  - have an attempt limit and a resend cooldown;
  - are rate-limited per number and per Member.
- **Keep SMS to a minimum.** Sign-in uses Clerk with email and authenticator-app MFA rather than
  SMS. MSG91 is used only where Nivomi itself must verify a phone number (PRD FR-147).

## Consequences

- **DLT registration for Nivomi itself.** Every SMS to an Indian number requires DLT registration
  of the sending entity, an approved header and an approved content template, and OTPs belong in
  the transactional category (MSG91 DLT help pages, checked 2026-09-26). Nivomi therefore
  registers as a principal entity for its own OTP SMS, independently of its tenants' telecom
  registrations.
- **Clerk SMS.** Clerk enables SMS only for the US and Canada by default, and India must be added
  to an allowlist (Clerk docs, checked 2026-09-26). Using Clerk SMS for Indian users is therefore
  a deliberate choice, not a default.
- **Metering.** SES and MSG91 usage is metered as platform cost (PRD §13).
- **Adapter details.** API details, webhooks for bounces and delivery reports, and pricing must come
  from the providers' current documentation when the adapters are built.
