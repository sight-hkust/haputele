resource "nomad_job" "caddy" {
  depends_on = [
    null_resource.wait_for_nomad,
    nomad_job.frontend,
    nomad_job.backend,
    nomad_job.livekit,
  ]

  jobspec = templatefile(
    "${path.module}/templates/caddy.nomad.tpl",
    {}
  )
}

resource "aws_lightsail_instance_public_ports" "caddy_http" {
  instance_name = aws_lightsail_instance.debian_vm.name

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
  }
}

output "public_url" {
  value = "http://${aws_lightsail_instance.debian_vm.public_ip_address}"
}
