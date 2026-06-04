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

  # LiveKit media: 7881 RTC/TCP fallback, 50000-50100 RTC/UDP. Signaling (7880)
  # is NOT exposed directly — browsers reach it as wss://<domain>/livekit through
  # Caddy on 443, which reverse-proxies to the livekit container internally.
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
