resource "nomad_job" "livekit" {
  depends_on = [null_resource.wait_for_nomad]

  jobspec = templatefile(
    "${path.module}/templates/livekit.nomad.tpl",
    {
      livekit_api_key    = var.livekit_api_key
      livekit_api_secret = var.livekit_api_secret
    }
  )
}

resource "aws_lightsail_instance_public_ports" "livekit_signaling" {
  instance_name = aws_lightsail_instance.debian_vm.name

  port_info {
    protocol  = "tcp"
    from_port = 7880
    to_port   = 7880
  }
}

resource "aws_lightsail_instance_public_ports" "livekit_rtc_tcp" {
  instance_name = aws_lightsail_instance.debian_vm.name

  port_info {
    protocol  = "tcp"
    from_port = 7881
    to_port   = 7881
  }
}

resource "aws_lightsail_instance_public_ports" "livekit_rtc_udp" {
  instance_name = aws_lightsail_instance.debian_vm.name

  dynamic "port_info" {
    for_each = range(50000, 50101)
    content {
      protocol  = "udp"
      from_port = port_info.value
      to_port   = port_info.value
    }
  }
}

output "livekit_url_internal" {
  value = "ws://${aws_lightsail_instance.debian_vm.public_ip_address}:7880"
}
