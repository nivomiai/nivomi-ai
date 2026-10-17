/**
 * Network module (ADR-030): one VPC, three subnet tiers across two AZs. SKELETON — body
 * provisioned when the AWS hold is lifted.
 */

variable "environment" { type = string }
variable "region" { type = string }

# Outputs land empty until the resource blocks below are uncommented and the account exists.

output "vpc_id" { value = "" }
output "public_subnet_ids" { value = [] }
output "private_subnet_ids" { value = [] }
output "isolated_subnet_ids" { value = [] }

# resource "aws_vpc" "main" {
#   cidr_block           = "10.0.0.0/16"
#   enable_dns_hostnames = true
#   enable_dns_support   = true
# }
#
# resource "aws_subnet" "public" {
#   count             = 2
#   vpc_id            = aws_vpc.main.id
#   availability_zone = data.aws_availability_zones.available.names[count.index]
#   cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
#   map_public_ip_on_launch = true
# }
# … private, isolated subnets, IGW, NAT, route tables …
