# Provider accounts: setup plan

> **Status:** plan, 2026-09-26. No integration code exists yet. Accounts are created in waves, just
> before the work that needs them, so that no account sits idle, costs money or leaks.
> **Owner actions** are for the Nivomi team. **Engineering actions** are for Claude or developers.
> Provider console details change often, so confirm each step in the provider's current
> documentation.

## Ground rules (every account)

1. **Company ownership.** Register every provider account to a company-controlled email, ideally
   on the company domain (for example `ops@<domain>`), not a personal inbox. Store logins in a
   shared password manager.
2. **2FA on every console.** Turn on two-factor authentication before creating any API key.
3. **Secrets never go in chat, tickets, docs or git.** Put them in `apps/api/.env.local` (ignored by
   git) for local work, and in AWS Secrets Manager for deployed environments. Tell engineering only
   the **variable name** you filled in.
4. **Test mode first.** Use test or sandbox modes and the lowest-privilege keys each provider
   offers. Set spend limits or prepaid caps wherever possible.
5. **Rotate on exposure.** If a secret is ever pasted anywhere public or shared, rotate it
   immediately.
6. **Two kinds of credential.**
   - **Platform credentials**, below, are Nivomi's own accounts.
   - **Tenant credentials**, such as a customer's HubSpot tokens, are never environment variables.
     They are obtained through OAuth at runtime and stored encrypted in the database (ADR-012).
7. **Spike calls go only to team members' own phones**, never to leads or customers, until
   compliance (ADR-014) and the telecom registrations are in place.

## Wave 1: voice spike (now)

**Goal:** one real phone call. Exotel dials a team member's phone, Sarvam listens and speaks, an LLM
answers, and we measure turn latency, barge-in and a transfer to a second phone (PRD NFR-1 to
NFR-4; VQ-1, VQ-2 and VQ-9).

| Provider                              | Owner action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What engineering needs (variable names in `.env.local`)                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Exotel**                            | 1. Create an account under the company (KYC needs business documents such as GST, PAN and incorporation).<br>2. Choose the **India (Mumbai)** data region at sign-up; it cannot be changed later.<br>3. Buy or assign one ExoPhone (virtual number).<br>4. Ask Exotel support to **enable AgentStream / Voicebot and the Connect Voice AI API** on the account.<br>5. Send them the questions VQ-1, VQ-2, VQ-7, VQ-8 and VQ-13 (engineering drafts the email).<br>6. Add prepaid credit with a low cap. | `EXOTEL_ACCOUNT_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_API_HOST` (the regional API host shown in your console; Mumbai-region accounts use a different host from Singapore ones), `EXOTEL_CALLER_ID` (the ExoPhone); for the transfer test also `EXOTEL_FLOW_APP_ID` (a Voicebot → Connect flow) |
| **Sarvam**                            | Create an account in the Sarvam dashboard and generate an API key. Ask for the **DPA with no training on customer data** (VQ-5) now; it is a Phase B gate.                                                                                                                                                                                                                                                                                                                                              | `SARVAM_API_KEY`                                                                                                                                                                                                                                                                                             |
| **LLM (one candidate for the spike)** | Create an API key with a **monthly spend limit** for one candidate. The full evaluation later needs 2 or 3 candidates (NFR-6).                                                                                                                                                                                                                                                                                                                                                                          | `LLM_BASE_URL` (any OpenAI-compatible endpoint; default `https://api.openai.com/v1`), `LLM_API_KEY`, `LLM_MODEL` (exact model ID from the console)                                                                                                                                                           |
| **Test phones**                       | Two team members' mobile numbers, with their consent: one receives the AI call, the other receives the transfer.                                                                                                                                                                                                                                                                                                                                                                                        | `SPIKE_TEST_PHONE_A`, `SPIKE_TEST_PHONE_B` (E.164, for example `+9198…`)                                                                                                                                                                                                                                     |
| **Public tunnel**                     | Install `cloudflared` (`winget install Cloudflare.cloudflared`). Exotel must reach a WebSocket on the tester's machine; the tunnel runs only while testing.                                                                                                                                                                                                                                                                                                                                             | `PUBLIC_BASE_URL` (the tunnel's `https://` URL), `SPIKE_STREAM_TOKEN` (random string guarding the endpoints)                                                                                                                                                                                                 |

Wave 1 secrets go in `spikes/voice-loop/.env.local`, which git ignores. Engineering creates the
folder and a `.env.example` listing the names above, so you only fill in values.

**Engineering, Wave 1: built.** Branch `spike/voice-loop`, folder `spikes/voice-loop/`. The
[README](../../spikes/voice-loop/README.md) on that branch has the full runbook:

1. `npm run check` validates every key with a harmless call and prints OK or FAIL only.
2. `npm run server` and `npm run call` place test calls.
3. `npm run report` turns the call logs into per-stage latency tables.

Results go to `docs/planning/spikes/voice-loop-results.md` and feed `bmad-architecture`.

## Wave 2: platform foundation (epics E0 and E1)

| Provider           | Owner action                                                                                                                                                                                                                                                                                        | Engineering needs                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Domain and DNS** | Confirm the company domain and who controls its DNS. Clerk production, SES, webhooks and the app all need it.                                                                                                                                                                                       | The domain name, and DNS access for records (engineering supplies the records)                            |
| **AWS**            | 1. Create an AWS account (company email, root MFA, **no root access keys**).<br>2. Enable billing alerts and a budget.<br>3. Create an IAM Identity Center admin user.<br>4. Use `ap-south-1` as the default region.<br>5. Later: separate accounts for staging and production (AWS Organizations). | No static keys in files. Local work uses an SSO profile (`AWS_PROFILE`); deployed services use IAM roles. |
| **Clerk**          | Create an application and a **development instance**. Turn on Organizations. Use email plus authenticator-app MFA, with no SMS (A-88). The production instance comes later, on the domain.                                                                                                          | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`                   |
| **Grafana Cloud**  | Create a stack and choose the **India region (AWS ap-south-1)** at creation. Create an access-policy token for OTLP ingestion only.                                                                                                                                                                 | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (holds the token)                             |

## Wave 3: feature integrations (epics E9, E12, E13)

| Provider          | Owner action                                                                                                                                                                                                                                 | Engineering needs                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Amazon SES**    | Nothing beyond AWS. Engineering verifies the domain (DKIM, SPF, DMARC records) and requests **production access** to leave the SES sandbox.                                                                                                  | `SES_REGION=ap-south-1`, `SES_FROM_ADDRESS`                                                                                      |
| **MSG91 and DLT** | **Start early; it takes days.**<br>1. Register Nivomi as a principal entity on an operator DLT portal.<br>2. Get a sender header approved.<br>3. Get an **OTP template** approved (transactional category).<br>4. Map the template in MSG91. | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SENDER_ID`                                                                     |
| **HubSpot**       | Create a **HubSpot developer account** and a **public (OAuth) app**, plus a developer test account for sandbox data. Engineering sends the redirect URL and the minimum scopes.                                                              | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`. Tenant tokens are OAuth only, never environment variables. |
| **Razorpay**      | Create an account and use **test mode** keys. Complete KYC activation before live billing. Confirm metered and add-on charges and GST invoices (VQ-11).                                                                                      | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`                                                              |

## Wave 4: when the decisions land

| Provider                          | Trigger                                                 | Notes                                                                                                     |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Google Cloud** (Calendar OAuth) | OD-1, if Google Calendar is the first external calendar | OAuth consent-screen verification for calendar scopes can take weeks, so start as soon as OD-1 is decided |
| **Further LLM candidates**        | LLM evaluation (NFR-6)                                  | 2 or 3 candidates, including one that can keep processing in India for India-only tenants (NFR-27)        |
| **Exotel numbers for customers**  | OD-2, after Exotel's answers                            | 140xx and 1601xx provisioning under each customer's DLT registration                                      |

## What is deliberately not done yet

- **No provider variables in `@nivomi/config` or `apps/api/.env.example` yet.** Each is added,
  validated and documented by the story that first uses it, so configuration never gets ahead of
  the code (CLAUDE.md).
- **No production accounts or live payment modes** before Phase B launch gates (PRD AC-6).
