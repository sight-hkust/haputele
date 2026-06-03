resource "nomad_job" "livekit" {
  depends_on = [null_resource.wait_for_nomad]

  jobspec = templatefile(
    "${path.module}/templates/livekit.nomad.tpl",
    {
      livekit_api_key    = local.livekit_api_key
      livekit_api_secret = local.livekit_api_secret
    }
  )
}

output "livekit_url_internal" {
  value = "ws://${aws_lightsail_instance.debian_vm.public_ip_address}:7880"
}
