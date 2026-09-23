# ADR-001: Modular monolith with workers

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

Nivomi spans many domains (tenancy, customers, campaigns, voice, AI, CRM, billing) but starts with
a small team and no production traffic. Microservices would multiply deployment, observability and
consistency costs before there is evidence of which boundaries matter.

## Decision

One API deployable (`apps/api`) structured as isolated NestJS modules per domain, plus background
worker processes (`workers/*`, added when needed) sharing the same packages. Modules expose
services/interfaces and emit events; they do not reach into each other's tables. External vendors
sit behind provider interfaces.

## Consequences

- Simple deploys and local development; transactions across domains where genuinely needed.
- Module discipline must be enforced in review (and later with lint boundary rules).
- A module can be extracted into a service later because callers depend on interfaces and events.
