resource "aws_lightsail_instance" "debian_vm" {
  name              = "debian-vm"
  availability_zone = data.sops_file.secrets.data["availability_zone"]
  blueprint_id      = "debian_12"
  bundle_id         = "small_3_0"
  user_data         = <<-EOF
              #cloud-config
              ssh_authorized_keys:
                - ${tls_private_key.vm_key.public_key_openssh}
              packages:
                - apt-transport-https
                - ca-certificates
                - curl
                - gnupg
              write_files:
                - path: /etc/nomad.d/nomad.hcl
                  content: |
                    datacenter = "dc1"
                    data_dir   = "/opt/nomad/data"
                    server {
                      enabled          = true
                      bootstrap_expect = 1
                    }
                    client {
                      enabled = true
                    }
                    host_volume "postgres_data" {
                      path      = "/opt/postgres/data"
                      read_only = false
                    }
                    host_volume "caddy_data" {
                      path      = "/opt/caddy/data"
                      read_only = false
                    }
              runcmd:
                - install -m 0755 -d /etc/apt/keyrings
                - install -m 0755 -d /etc/nomad.d
                - install -m 0755 -d /opt/nomad/data
                - install -m 0755 -d /opt/postgres/data
                - install -m 0755 -d /opt/caddy/data
                - curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                - chmod a+r /etc/apt/keyrings/docker.gpg
                - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
                - curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /etc/apt/keyrings/hashicorp.gpg
                - chmod a+r /etc/apt/keyrings/hashicorp.gpg
                - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo $VERSION_CODENAME) main" > /etc/apt/sources.list.d/hashicorp.list
                - apt-get update
                - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nomad
                - systemctl enable docker
                - systemctl start docker
                - systemctl enable nomad
                - systemctl start nomad
              EOF
  tags = {
    Name = "debian-vm"
  }
}

output "vm_public_ip" {
  value = aws_lightsail_instance.debian_vm.public_ip_address
}