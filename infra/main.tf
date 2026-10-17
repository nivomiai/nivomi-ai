/**
 * Nivomi root infrastructure composition (ADR-030, Phase 11).
 *
 * This file is a SKELETON. The real resources apply only once the AWS hold is lifted
 * (see docs/planning/status-holds-and-next.md). Until then, modules carry the planned shape
 * so a future `terraform init` + `plan` describes concrete work rather than a blank page.
 */

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # State backend wiring — the bucket + lock table are provisioned once, out of band.
  # backend "s3" {
  #   bucket         = "nivomi-tf-state-ap-south-1"
  #   key            = "env/${terraform.workspace}/root.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "nivomi-tf-locks"
  #   encrypt        = true
  # }
}

module "network" {
  source      = "./modules/network"
  environment = var.environment
  region      = var.region
}

module "data" {
  source               = "./modules/data"
  environment          = var.environment
  vpc_id               = module.network.vpc_id
  private_subnet_ids   = module.network.private_subnet_ids
  isolated_subnet_ids  = module.network.isolated_subnet_ids
  rds_instance_class   = var.rds_instance_class
  redis_node_type      = var.redis_node_type
}

module "app" {
  source                 = "./modules/app"
  environment            = var.environment
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  private_subnet_ids     = module.network.private_subnet_ids
  rds_endpoint           = module.data.rds_endpoint
  redis_endpoint         = module.data.redis_endpoint
  uploads_bucket         = module.data.uploads_bucket
  recordings_bucket      = module.data.recordings_bucket
  secrets_arn_prefix     = module.data.secrets_arn_prefix
  api_desired_count      = var.api_desired_count
  worker_desired_count   = var.worker_desired_count
  voice_desired_count    = var.voice_desired_count
}
