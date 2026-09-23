# API

Base path: `/api/v{n}` (URI versioning; current version `v1`). JSON only; request bodies are
limited to 1 MB.

## Conventions

| Topic          | Rule                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correlation    | Every response carries `x-request-id`. Callers may send a well-formed `x-request-id` (8–128 chars of `A-Z a-z 0-9 . _ : -`) to join traces; anything else is replaced |
| Errors         | Always the envelope below, with an HTTP status matching `code`                                                                                                        |
| Authentication | _Not implemented yet._ Tenant context will come from the authenticated session, never from request parameters                                                         |
| Lists          | Planned: cursor pagination, filtering and sorting on every list endpoint                                                                                              |
| Idempotency    | Planned: `Idempotency-Key` header on side-effecting POSTs                                                                                                             |
| CORS           | Only origins in `CORS_ALLOWED_ORIGINS`; `x-request-id` is exposed to browsers                                                                                         |

## Error envelope

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cannot GET /api/v1/unknown",
    "requestId": "8f14e45f-ceea-4e7b-9f0a-2c3b1d5e6a70",
    "details": ["optional list, e.g. validation messages"]
  }
}
```

- `code` is the HTTP status name (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `INTERNAL_SERVER_ERROR`, …).
  Domain-specific codes will be added as features need them.
- 5xx responses always carry the generic message `Internal server error`; the cause is logged
  with the same `requestId`.

## Endpoints

### `GET /api/v1/health` (liveness)

Unauthenticated, `Cache-Control: no-store`, excluded from request logs.

```json
{ "status": "ok", "version": "abc1234", "uptimeSeconds": 42 }
```

`version` is `APP_VERSION` (set by CI/CD). A readiness endpoint that checks PostgreSQL and Redis
will be added with those dependencies.
