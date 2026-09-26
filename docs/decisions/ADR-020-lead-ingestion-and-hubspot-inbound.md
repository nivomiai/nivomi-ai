# ADR-020: Lead data model, file import and HubSpot inbound sync

- **Status:** Accepted
- **Date:** 2026-09-27
- **Builds on:** ADR-008 (data access), ADR-012 (HubSpot), ADR-017 (one ingestion path), ADR-019 (jobs)

## Context

Phase 2 delivers contacts, leads and file import (PRD §8.3–8.4). The owner also asked for the CRM
part now: connect an organization's own HubSpot, fetch its contacts and leads, and store them in
Nivomi's database. ADR-017 fixed the principle (every source converges on Nivomi records). This
ADR records the concrete design.

## Decision

**Data model** (migration `0001`). Every table carries `organization_id`.

- **Contacts and leads.**
  - `contacts` hold identity: E.164 phone, email and a normalized key, company, location,
    language and custom fields.
  - `leads` hold the sales relationship: status, source, owner, consent basis with evidence,
    score and read-only CRM context.
  - There is one open Lead per Contact (partial unique index, PRD A-79). A converted or closed
    Lead is never reopened by a re-import or a sync.
- **Supporting tables.**
  - `lead_status_changes`: idempotent per `event_key` (FR-24).
  - `record_history`: every overwrite of a stored value (FR-138).
  - `suppression_entries`: one per organization and phone.
  - `external_record_links`: provider, account, object type and external ID (FR-129); never a
    primary key.
  - `ingestion_review_items`: uncertain matches (FR-17).

**One engine** (`IngestionEngine`) for files, HubSpot, manual entry and the dev seed:

- **Pipeline:** validate → match → persist.
- **Matching order:** External Record Link, then phone, then email, within the organization.
- **Outcomes:** CREATE, UPDATE, SKIP or REVIEW.
  - REVIEW when phone and email point at different contacts, the names conflict, or the match
    is linked to another record in the same external account.
- **Field ownership:**
  - A file only fills empty fields; differing values are reported, never overwritten.
  - A CRM owns contact details on records linked to it, and every overwrite is written to
    `record_history`.
- **Concurrency:** writes take a per-organization advisory transaction lock, so an import and
  a sync cannot both create the same contact.

**File import.**

- **Upload:** the browser uploads straight to storage through a signed URL that expires after
  15 minutes (`StorageProvider`). The local adapter is for development; S3 is TECH_DEBT and
  production refuses local storage.
- **Validation before parsing:** type, size (20 MB) and structure. For `.xlsx`, a zip-bomb guard
  reads the central directory before any decompression.
- **Parsers:** `csv-parse` and `read-excel-file`. `exceljs` was rejected: unmaintained since
  2024 and it pulls in old dependencies.
- **Workflow:** parsed rows are staged in `import_rows`. The Member maps columns (synonym
  suggestions, never guessed) and previews the counts (no writes), then confirms.
- **Processing:** chunks of 500 rows, each in one transaction with its checkpoint, and a
  savepoint per row so a bad row never fails the job.
- **Error report:** a CSV guarded against formula injection.
- **Retention:** the file and staged rows are deleted after 30 days (A-93).

**HubSpot inbound.** Endpoints come from HubSpot's official docs, checked 2026-09-26.

- **OAuth v3.** `app.hubspot.com/oauth/authorize` with required scopes
  `crm.objects.contacts.read crm.objects.companies.read`, optional `crm.objects.leads.read`, and
  a signed `state`. Code exchange and refresh go through `POST /oauth/v3/token`.
  - The `state` binds the flow to the Member and organization. The callback re-checks both, plus
    the `integrations.manage` permission.
  - Tokens are encrypted with AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`, rotatable) and refreshed
    5 minutes before expiry under a row lock. They are never returned or logged.
- **Account rules.**
  - One HubSpot account can be live in only one organization (A-39).
  - Switching an organization to a different account requires explicit confirmation and resets
    the consent mapping.
- **CRM API.** The date-versioned `2026-09` CRM object APIs (HubSpot's recommendation for new
  integrations).
  - **Full sync:** lists contacts with their company association (the companies are then batch
    read), then HubSpot Leads when that scope was granted.
  - **Incremental sync:** searches `hs_lastmodifieddate` from a watermark with a 5-minute overlap,
    and restarts the search before the 10,000-result cap.
  - Runs are chunked with a resumable cursor, and one sync runs per connection at a time.
- **Rate limits.** Client-side throttling of 90 requests per 10 seconds and 4 search requests per
  second, under HubSpot's 110 per 10 seconds and 5 per second. 429 responses are retried with
  bounded backoff.
- **Failures.**
  - A revoked grant sets TOKEN_INVALID and stops syncing.
  - Outages retry 5 times, then set DEGRADED; the scheduled syncs keep going.
  - Nothing ever fails a business action (FR-95).
- **Scheduling:** every 15 minutes (A-83), through the job queue.
- **Consent:** CRM data is never assumed callable. An admin maps one HubSpot property to Consent
  Basis values (or to DND for opt-outs); without a mapping, contacts import as not callable.
- **HubSpot Leads:** read-only. They are linked to the Nivomi Lead of their associated contact,
  and their name, type and label are shown as CRM context. Nivomi's Lead Status stays
  Nivomi-owned. This resolves PRD A-40 for reads; writes remain post-MVP.
- **Revocation:** uses the documented v1 `DELETE /oauth/v1/refresh-tokens/{token}`, which is
  supported until 2027-02-16. The body of its 2026-03 replacement is not documented yet, so
  migrating is TECH_DEBT.

**Structure.** Shared infrastructure moved to a global `PlatformModule`. Domains are
`LeadsModule`, `ImportsModule` and `CrmModule`.

## Consequences

- Writes back to HubSpot (FR-88–FR-93) and inbound webhooks (FR-94) are not built. They extend
  `CRMProvider` in the CRM phase, through the outbox.
- Ingestion is row-by-row, about 8 queries per row. That is fine at pilot volume. Batched lookups
  are needed before 100,000-row files are routine (TECH_DEBT).
- Search is `ILIKE`. It needs a trigram index at scale (TECH_DEBT).
- The adapter's throttle is per process. It needs a shared limiter when several workers sync the
  same account.
- Production needs, before launch: the S3 adapter (SSE-KMS, ap-south-1), KMS envelope encryption
  instead of a static key, malware scanning of uploads, and a HubSpot app registered with the
  redirect URL `https://<app host>/api/v1/integrations/crm/hubspot/callback`.
