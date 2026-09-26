# ADR-016: OpenTelemetry to Grafana Cloud, CloudWatch for AWS infrastructure

- **Status:** Accepted. Amends ADR-010's "Logs, metrics, alarms" row.
- **Date:** 2026-09-26

## Context

A voice platform must trace a single call across the API, queues, the voice worker, STT, the LLM,
TTS and CRM sync, and must show latency per stage. ADR-010 placed logs, metrics and alarms in
CloudWatch. The owner has chosen Grafana Cloud for application observability. CERT-In requires ICT
logs to be kept for 180 days within India.

## Decision

- **Instrumentation:** OpenTelemetry for traces, metrics and logs. The existing pino logs stay the
  structured-log source, correlated through trace and span IDs. Application code never imports a
  Grafana SDK; exporters are configuration.
- **Application observability:** Grafana Cloud, in a stack in its **India region (AWS
  ap-south-1)**. Grafana's regional-availability page, checked 2026-09-26, lists "India | AWS
  `ap-south-1`". Grafana Cloud hosts the dashboards and alerts listed in PRD NFR-41.
- **AWS infrastructure:** CloudWatch for ECS, RDS, ElastiCache, ALB and similar metrics and alarms.
- **Retention and residency:** keep telemetry short-lived in Grafana Cloud, and archive logs to S3
  in ap-south-1 for the CERT-In and DPDP retention periods. This design is an assumption (PRD A-90)
  until it is confirmed which signals Grafana stores in-region and at what retention (PRD VQ-14).

## Consequences

- **Cardinality and redaction.** Metric labels are restricted. Phone numbers, emails, Transcripts
  and Lead IDs are never labels. Redaction (`REDACTED_PATHS`) applies before export.
- **Cost control.** Trace sampling, log levels and retention tiers are configuration (PRD NFR-42),
  and Grafana cost appears in the platform cost view.
- **Grafana outage.** A Grafana Cloud outage never affects request handling; exporters buffer and
  drop.
- **Documentation.** OBSERVABILITY.md is updated when the instrumentation story lands.
