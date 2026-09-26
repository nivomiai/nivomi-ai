# ADR-019: PostgreSQL-backed jobs for the MVP; pluggable rate-limit stores

- **Status:** Accepted, 2026-09-26. Refines ADR-010, where ElastiCache was named for queues.

## Context

The brief requires background jobs with explicit states, retries, backoff and dead-lettering,
and layered rate limiting that works across instances. It also asks for the lowest practical
cost: no extra infrastructure without a need. MVP job volume is small. The largest source is CSV
import batches plus CRM sync, around 30,000 calls a month (PRD NFR-12).

## Decision

**Jobs live in PostgreSQL.**

- A `jobs` table with states `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `RETRYING` and
  `CANCELLED`.
- Each job records its attempt count, `run_at`, `last_error` and timestamps, plus an optional
  unique `idempotency_key`.
- Workers claim jobs with `FOR UPDATE SKIP LOCKED`. Retries use exponential backoff with jitter
  up to `max_attempts`; a job that exhausts them is `FAILED` and serves as the dead letter.
- Jobs are enqueued in the same transaction as the business change, so a job cannot be lost if
  the database commits (a transactional outbox).
- **Why PostgreSQL:** it gives exactly-once enqueue with the data, no second system to run, and
  real-Postgres tests through PGlite.
- The worker runs inside the API process when `WORKER_ENABLED=true`. It becomes its own ECS
  service (same code) once load needs it (ADR-001).

**Rate limiting sits behind a `RateLimitStore` interface.**

- Fixed-window counters keyed by any mix of IP, user, tenant, endpoint and email.
- **Memory store** for development, tests and single-instance runs.
- **Redis store** (ElastiCache) once there is more than one instance.
- **If Redis is unavailable:** limiting falls back to the per-instance memory store and logs a
  warning. Abuse protection never switches off silently.

**Quotas are separate from rate limits.** Quotas are business limits (minutes, imports,
concurrent calls) enforced by the usage domain, not by this layer.

## Consequences

- **Scaling path.** If job volume or latency outgrows PostgreSQL, the `JobQueue` interface can
  move to Redis (for example BullMQ) or SQS without touching the job handlers.
- **ElastiCache timing.** It is needed only once there are several API instances (rate limits,
  caching) or voice-session state (ADR-010/011), not for the first deploy.
