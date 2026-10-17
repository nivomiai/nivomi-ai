provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "nivomi"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
