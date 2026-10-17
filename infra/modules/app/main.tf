/**
 * App module (ADR-030): three ECS Fargate services (api, worker, voice-worker) behind an ALB,
 * with ACM cert and Route 53 record. SKELETON — body provisioned when the AWS hold is lifted.
 */

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "rds_endpoint" { type = string }
variable "redis_endpoint" { type = string }
variable "uploads_bucket" { type = string }
variable "recordings_bucket" { type = string }
variable "secrets_arn_prefix" { type = string }
variable "api_desired_count" { type = number }
variable "worker_desired_count" { type = number }
variable "voice_desired_count" { type = number }

output "alb_dns_name" { value = "" }
output "api_service_arn" { value = "" }
output "worker_service_arn" { value = "" }
output "voice_service_arn" { value = "" }

# ECS cluster, task definitions (api/worker/voice), ALB, listeners, target groups, autoscaling
# policies, Route 53 records, ACM cert.
