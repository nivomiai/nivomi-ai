variable "environment" {
  type        = string
  description = "Deployment environment: staging | production."
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region (ADR-010: India data residency)."
}

variable "rds_instance_class" {
  type        = string
  default     = "db.m6g.large"
  description = "RDS instance class; db.m6g.large is the Phase 11 default per ADR-030."
}

variable "redis_node_type" {
  type        = string
  default     = "cache.r6g.large"
  description = "ElastiCache Redis node type for the rate-limit store (ADR-019)."
}

variable "api_desired_count" {
  type        = number
  default     = 2
  description = "ECS Fargate desired count for the API service."
}

variable "worker_desired_count" {
  type        = number
  default     = 2
  description = "ECS Fargate desired count for the generic worker service."
}

variable "voice_desired_count" {
  type        = number
  default     = 2
  description = "ECS Fargate desired count for the voice worker service."
}
