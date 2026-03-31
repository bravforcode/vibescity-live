---
name: infra-as-code
description: >
  Expert Infrastructure-as-Code skill for Terraform, Pulumi, and cloud resource management.
  ALWAYS use this skill when the user mentions: Terraform, Pulumi, CDK, infrastructure code,
  AWS/GCP/Azure resources, VPC, ECS, EKS, RDS, S3, CloudFront, Load Balancer, cloud
  networking, IAM roles/policies, cloud security groups, infrastructure automation, or "write
  IaC for X". Also triggers for: "provision a server", "set up cloud infrastructure", "create
  AWS resources", "write Terraform for Y", "deploy to ECS/EKS", "set up RDS/database in cloud",
  "create a VPC", or any cloud architecture question that involves actual resource creation.
  Delivers modular, DRY, security-hardened Terraform/Pulumi configs with proper state management.
---

# Infrastructure as Code Skill

## Core Principles
- **State is sacred** — remote state in S3+DynamoDB (AWS) or GCS (GCP)
- **Modules for reuse** — don't repeat resource blocks
- **Least privilege IAM** — never wildcard permissions
- **Separate state per environment** — dev/staging/prod workspaces or directories
- **Tagging everything** — cost allocation, ownership, environment

---

## Terraform Project Structure

```
infrastructure/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
├── modules/
│   ├── vpc/
│   ├── ecs-service/
│   ├── rds/
│   └── s3-cloudfront/
└── global/
    └── iam/
```

---

## State Backend Setup (AWS)

```hcl
# First: create state bucket manually or with bootstrap script
terraform {
  required_version = ">= 1.7"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "myapp-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"   # prevent concurrent applies
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "myapp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
```

---

## VPC Module (modules/vpc/main.tf)

```hcl
variable "environment" { type = string }
variable "cidr_block"  { type = string default = "10.0.0.0/16" }
variable "az_count"    { type = number default = 2 }

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_subnet" "public" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + var.az_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_eip" "nat" {
  count  = var.az_count
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  count         = var.az_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table" "private" {
  count  = var.az_count
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

output "vpc_id"             { value = aws_vpc.main.id }
output "public_subnet_ids"  { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
```

---

## ECS Fargate Service (modules/ecs-service/main.tf)

```hcl
variable "name"           { type = string }
variable "image"          { type = string }
variable "cpu"            { type = number default = 256 }
variable "memory"         { type = number default = 512 }
variable "desired_count"  { type = number default = 2 }
variable "container_port" { type = number default = 3000 }
variable "vpc_id"         { type = string }
variable "subnet_ids"     { type = list(string) }
variable "environment_vars" {
  type    = list(object({ name = string, value = string }))
  default = []
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.name}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = var.name
    image     = var.image
    essential = true
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    environment = var.environment_vars
    secrets = []          # use AWS Secrets Manager
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.name}"
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false    # private subnets + NAT
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.name
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]    # managed by autoscaling
  }
}

# Auto Scaling
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu-scaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value = 70.0
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
```

---

## RDS PostgreSQL (modules/rds/main.tf)

```hcl
variable "identifier"     { type = string }
variable "instance_class" { type = string default = "db.t3.medium" }
variable "db_name"        { type = string }
variable "db_username"    { type = string }
variable "subnet_ids"     { type = list(string) }
variable "vpc_id"         { type = string }

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.identifier}-db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_db_subnet_group" "main" {
  name       = var.identifier
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "main" {
  identifier     = var.identifier
  engine         = "postgres"
  engine_version = "16.1"
  instance_class = var.instance_class
  
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"
  
  multi_az               = true          # high availability
  storage_encrypted      = true
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "${var.identifier}-final"
  
  performance_insights_enabled = true
  monitoring_interval          = 60
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

output "db_endpoint" { value = aws_db_instance.main.endpoint }
output "db_password_secret_arn" { value = aws_secretsmanager_secret.db_password.arn }
```

---

## Common Terraform Commands
```bash
terraform init              # initialize, download providers
terraform plan              # preview changes
terraform plan -out=plan    # save plan for apply
terraform apply plan        # apply saved plan
terraform apply -auto-approve  # skip confirmation (CI only)
terraform destroy           # tear down
terraform state list        # show managed resources
terraform import aws_s3_bucket.main my-bucket  # import existing
terraform fmt               # format code
terraform validate          # validate syntax
```
