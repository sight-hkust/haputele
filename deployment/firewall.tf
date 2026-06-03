# Lightsail's PutInstancePublicPorts API (behind this resource) is authoritative:
# it CLOSES every port not present in the request. So all public ports for the
# instance must live in a single resource — multiple resources would clobber
# each other on every apply and flap the firewall.
resource "aws_lightsail_instance_public_ports" "vm" {
  instance_name = aws_lightsail_instance.debian_vm.name

  # SSH.
  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }

  # Nomad HTTP API. Terraform (the nomad provider + wait_for_nomad) connects
  # here over the public IP, so it must stay reachable.
  # SECURITY: this Nomad API has no ACL/TLS; an open 4646 lets anyone submit
  # jobs (RCE). Lock this down (Nomad ACLs, or restrict cidrs to the CI egress
  # range) before treating this as anything more than a disposable env.
  port_info {
    protocol  = "tcp"
    from_port = 4646
    to_port   = 4646
  }

  # Caddy: 80 for ACME HTTP-01 challenge + HTTP->HTTPS redirect, 443 for HTTPS.
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
  }
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
  }

  # LiveKit: 7880 signaling (WS), 7881 RTC/TCP fallback, 50000-50100 RTC/UDP.
  port_info {
    protocol  = "tcp"
    from_port = 7880
    to_port   = 7880
  }
  port_info {
    protocol  = "tcp"
    from_port = 7881
    to_port   = 7881
  }
  port_info {
    protocol  = "udp"
    from_port = 50000
    to_port   = 50100
  }
}
