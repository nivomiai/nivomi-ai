# Exotel multi-tenancy — recommendation for Nivomi

- **Author:** Engineering
- **Date:** 2026-10-10
- **Status:** Proposal — awaiting manager sign-off
- **Decision needed:** How Exotel accounts and numbers map to Nivomi tenants (customers), for
  both inbound and outbound calling.
- **Related:** ADR-011 (voice provider seam), ADR-024 (inbound calls), ADR-021 (telecom identities)

## TL;DR

**Recommend Option A — one Nivomi-owned Exotel account, with a shared pool of ExoPhones that
Nivomi assigns to tenants.** This is the only option that works on the free plan today and the
only one that lets Nivomi onboard SMB customers in minutes instead of days. Keep the door open
to Option B (BYO Exotel for enterprise) by storing the Exotel account reference per
`caller_numbers` row — the DB and provider seam already support it. Reject Option C.

## The three options

| Model                         | Who owns the Exotel contract                                                                                           | Credential storage                                            | Where it fits                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| **A. Nivomi-owned pool**      | Nivomi owns **one** Exotel account; many ExoPhones live in that account; each number is assigned to a tenant in the DB | One set of credentials, in Nivomi's secrets store             | **MVP, free plan, every SMB customer** — the default     |
| **B. BYO Exotel (hybrid)**    | Enterprise customer owns their Exotel account and gives Nivomi their SID + API key                                     | Per-organization encrypted credentials (same shape as ADR-011 fallbacks) | Only for customers who insist on owning the carrier contract (procurement, legal, regulated industries) |
| **C. One Exotel per client**  | Nivomi creates a new Exotel account for every tenant                                                                   | N × credential sets, N × DLT registrations                    | **Avoid.** Not possible on free, ops explodes with scale |

## Why Option A, in plain terms

### 1. It is the only option available on the free plan right now

Today Nivomi has one Exotel SID (`not6a7`) and two ExoPhones. Option A uses exactly that
footprint. Option B needs each customer to sign up with Exotel first, and Option C needs Nivomi
to pay for N paid accounts before any customer is live. Only A gets us to a shipping MVP.

### 2. SMB customers do not want to "bring their own Exotel"

The target customer is an SMB running outbound sales or inbound support. They want to sign up,
be assigned a number, and start calling. Asking them to go register with Exotel first, complete
KYC, buy numbers, do DLT registration themselves, then hand us their API keys — that is a
multi-day friction wall. We lose the self-serve motion the product brief is built on.

### 3. Inbound works cleanly on a pool

When a caller dials one of our ExoPhones, Exotel posts a webhook to Nivomi. We already look up
`To` (the dialled ExoPhone) in `caller_numbers`, find the owning `organization_id`, and route the
call to that tenant's bound Agent Version (ADR-024, already live in the current branch). The
pool model is what this routing was designed for — the tenant is identified by **which number
was dialled**, not by which Exotel account the call came from. Adding more tenants is one
`caller_numbers` row per number, no new credentials.

### 4. Outbound works cleanly on a pool

For outbound, each tenant has one or more numbers assigned from the pool. The campaign engine
picks the tenant's own number as caller ID when it dials. The `VoiceProvider` seam (ADR-011)
already looks up the number record to find the Exotel account to call through — today it only
ever resolves to the Nivomi account, but the seam does not hard-code it. One account means one
DLT registration, one caller-ID whitelist, one set of rate limits to understand, one bill to
reconcile.

### 5. Compliance and 140xx / 1601xx number series are centrally managed

Indian regulation (ADR-014, ADR-021) treats promotional, service and transactional traffic
differently. Numbers in the 140xx and 1601xx series have specific usage rules. Running one
Exotel account means Nivomi registers these series once with the carrier, keeps one DLT
template library, and enforces the series/purpose rules in software — no customer can
accidentally misuse a 140xx number for a transactional call because Nivomi is the one
assigning numbers.

### 6. Cost and ops are predictable

- One Exotel invoice. Usage is metered per-tenant in Nivomi's own DB (`usage_jsonb` on
  `call_sessions`, Phase 8 metering).
- One set of credentials to rotate. No per-customer offboarding dance when they churn.
- One place to apply rate limits, circuit breakers, fallback providers.

### 7. Enterprise exit valve is already designed in

The architecture does **not** paint us into a corner. `caller_numbers` is tenant-scoped, and the
`VoiceProvider` seam resolves the account per call. Adding Option B later is additive: one new
nullable column (`exotel_account_credentials_ref` or similar) that defaults to the Nivomi master
account and, when set, points to an encrypted per-org credential blob. No breaking change, no
rewrite. We add this when the first enterprise customer actually asks for it, not before.

## Why not Option C

| Problem                | Impact                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Not possible on free   | Free plan is one account. Every new tenant would need a paid plan on day 1, before they have proven value to Nivomi             |
| N × DLT registration   | Each account would need its own DLT templates, caller-ID verification, 140xx series registration. Weeks of ops per customer     |
| N × credential rotation| Rotating keys across hundreds of customer accounts is a security and ops nightmare                                              |
| N × invoices           | Finance team reconciles N Exotel bills instead of one                                                                            |
| No shared pool         | A tenant with 50 calls/day pays for a dedicated account; wasted capacity                                                         |
| Churn is painful       | Offboarding leaves orphan Exotel accounts and lingering carrier obligations                                                      |

The only context where C makes sense is a reseller model where Nivomi acts as a managed-services
partner and the carrier contract is in the customer's name — that is Option B, not C.

## What Option A looks like in practice today

With the free plan's two ExoPhones:

- Treat the two numbers as the **Nivomi master pool**.
- Register them in `caller_numbers` via the super-admin API already shipped
  (`POST /api/v1/platform/voice-numbers`, see ADR-024 implementation status).
- Assign both to the test org for now; as new tenants onboard, each gets at least one number
  from the pool.
- Inbound: `InboundCallService` resolves the dialled number to the tenant and the bound Agent
  Version. Already live.
- Outbound: Phase 3 campaign engine dials with the tenant's assigned number as caller ID.
- When we move off free, we buy additional ExoPhones in the same master account and add rows
  to `caller_numbers` — no architectural change.

## What we need from the manager

1. Approval to proceed with **Option A** as the Nivomi tenancy model for Exotel.
2. Agreement that **Option B is a Phase 2+ enterprise feature**, not MVP — we design the DB
   column now (one nullable field, costs nothing) but do not build the UI or credential
   onboarding until a paying enterprise customer requests it.
3. Confirmation we can **close Option C** — no customer-specific Exotel account provisioning
   on our roadmap.

Once approved, this proposal will be promoted to an ADR (likely **ADR-031: Exotel multi-tenancy
model**) so it binds future work the same way ADR-011 and ADR-024 do.
