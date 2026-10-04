/**
 * Data module (ADR-030): RDS PostgreSQL 17 Multi-AZ, ElastiCache Redis, S3 buckets, KMS keys.
 * SKELETON — body provisioned when the AWS hold is lifted.
 */

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "isolated_subnet_ids" { type = list(string) }
variable "rds_instance_class" { type = string }
variable "redis_node_type" { type = string }

output "rds_endpoint" { value = "" }
output "redis_endpoint" { value = "" }
output "uploads_bucket" { value = "" }
output "recordings_bucket" { value = "" }
output "secrets_arn_prefix" { value = "" }

# RDS, ElastiCache, S3 and KMS resource blocks land here (ADR-030 §2).
