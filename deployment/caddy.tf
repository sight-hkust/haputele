resource "nomad_job" "caddy" {
  depends_on = [
    null_resource.wait_for_nomad,
    nomad_job.frontend,
    nomad_job.backend,
    nomad_job.livekit,
  ]

  jobspec = templatefile(
    "${path.module}/templates/caddy.nomad.tpl",
    {
      domain = var.domain
    }
  )
}

output "public_url" {
  value = "https://${var.domain}"
}
