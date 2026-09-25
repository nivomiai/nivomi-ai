# ADR-010: AWS ap-south-1 hosting on ECS Fargate

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The launch market is India. Voice latency and data-protection expectations favor hosting close to
users and telephony infrastructure. The team is small, so managed services beat self-operated
clusters.

## Decision

AWS, region **ap-south-1 (Mumbai)**:

| Need                  | Service                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| API, web, workers     | ECS on Fargate (one service per deployable), images in ECR                       |
| Ingress               | Application Load Balancer (HTTP + WebSocket), CloudFront in front of the web app |
| Database              | RDS PostgreSQL (Multi-AZ for production, PITR backups)                           |
| Cache, queues, locks  | ElastiCache Redis                                                                |
| Recordings, uploads   | S3 (tenant-prefixed keys, KMS encryption, versioning)                            |
| Secrets               | Secrets Manager, injected as environment variables                               |
| Encryption keys       | KMS (also for envelope encryption of stored provider credentials)                |
| Logs, metrics, alarms | CloudWatch                                                                       |

Kubernetes/EKS is deferred until workload or operational needs justify it.

## Consequences

- Real-time voice sessions are long-lived WebSocket connections. Voice workers need connection
  draining on deploy and sticky routing per call; capacity planning is per concurrent call, not
  per request.
- Infrastructure is managed as code (tool chosen with the first infrastructure story); nothing is
  created by hand in the console.
- CI gains a deploy stage (build → push to ECR → migrate → deploy → smoke test) once the
  infrastructure exists.
- Single-region at launch; multi-region is deferred (product brief).
