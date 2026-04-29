provider "aws" {
  region = "us-east-1"
}

# Servidor principal
resource "aws_instance" "server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.small"
}

# Base de datos (disco)
resource "aws_ebs_volume" "db" {
  availability_zone = "us-east-1a"
  size              = 20
}

# Firewall básico (Security Group)
resource "aws_security_group" "web" {
  name = "redsocial-sg"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}