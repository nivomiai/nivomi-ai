# ADR-017: One ingestion path into Nivomi's Contact/Lead domain; CRM optional

- **Status:** Accepted. Amends ADR-012 (HubSpot remains the first CRM, and connecting it is now
  optional).
- **Date:** 2026-09-26

## Context

Customers start in different places. Some have only spreadsheets, some have only HubSpot, and
some have both. If campaigns or voice logic read from HubSpot directly, Nivomi would become a
CRM-dependent application: slower, rate-limited, fragile when the CRM is down, and unusable without
a CRM.

## Decision

- **Nivomi's Contact, Lead and Company records are the operational source of truth.** Every source
  converges on them: Excel, CSV, HubSpot, manual entry, inbound calls, and later an API or website
  forms. Campaigns, eligibility, voice, analytics and billing use only Nivomi IDs.
- **One ingestion path.** The `DataIngestionService` runs: validation → mapping → deduplication →
  compliance checks → persistence.
  - `FileImportProvider` handles `.xlsx` and `.csv`. `CRMProvider` handles CRM reads and writes.
  - Large files are processed as background import jobs, never inside an HTTP request.
- **Deduplication.** Records are matched within an Organization on normalized phone, normalized
  email, external ID and any identifier the Organization configures. Each record gets one outcome:
  `CREATE`, `UPDATE`, `SKIP` or `REVIEW`, and uncertain matches are never merged automatically.
- **External Record Links.** Each link holds the Organization, provider, external ID, source type,
  last-synced time and sync state. An external ID is never a Nivomi primary key.
- **CRM connection is optional.** Every feature except CRM sync works without one.
  - **Disconnecting** keeps all local data.
  - **Reconnecting** re-matches records through the External Record Links.
  - **CRM → Nivomi** sync uses webhooks, with scheduled incremental sync where webhooks do not
    cover a change.
  - **Nivomi → CRM** sync stays as ADR-012 defines it: outbox, idempotent, retried, dead-lettered.
- **Field ownership.** Each field is owned by the CRM, owned by Nivomi, or shared with a conflict
  strategy. Nivomi never writes CRM-owned fields, and inbound sync never overwrites Nivomi-owned
  fields.

## Consequences

- **The data model is decided in `bmad-architecture`.** This covers the Contact, Lead and Company
  model and the source and link tables. The PRD's working assumption is one open Lead per Contact
  (PRD A-79).
- **Compliance.** Imported and CRM data is never assumed to be callable: every record needs a
  Consent Basis and passes eligibility (ADR-014).
- **Uploaded files** are sensitive. They are stored encrypted in S3 in Mumbai, uploaded through
  short-lived signed URLs, deleted automatically after the import, and audited.
- **Tests.** Tenant-isolation tests cover import workers, sync workers and webhooks.
