# Observability

## Implemented

- **Structured logs:** pino via nestjs-pino. JSON in test/production, pretty single-line output in
  development. Every line carries `service` and `version` (`APP_VERSION`).
- **Correlation:** each request gets `req.id` (inbound `x-request-id` when well formed, else a
  UUID), echoed in the `x-request-id` response header and the error envelope, and attached to
  every log line emitted while handling the request.
- **Redaction:** `REDACTED_PATHS` in `apps/api/src/observability/logger.ts`. Extend it whenever a
  new credential-bearing header or field is introduced.
- **Noise control:** health probes are excluded from request logging.
- **Health:** `GET /api/v1/health` (liveness).
- **Level:** `LOG_LEVEL` env (`info` by default).

## Planned

| Signal                      | Notes                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness endpoint          | PostgreSQL + Redis checks, added with those dependencies                                                                                                         |
| Tenant / job / provider IDs | Bound to the log context by the tenancy middleware and worker job wrapper                                                                                        |
| Metrics                     | API latency and error rate, queue depth, worker failures, provider errors/latency, usage and provider cost. Backend (OpenTelemetry → vendor) chosen with hosting |
| Tracing                     | OpenTelemetry, with `x-request-id` as the correlation key across API and workers                                                                                 |
| Alerting                    | Error-rate, queue backlog, provider outage, cost/budget thresholds                                                                                               |
