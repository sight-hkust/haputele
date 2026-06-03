provider "nomad" {
  address = "http://${aws_lightsail_instance.debian_vm.public_ip_address}:4646"
}

resource "null_resource" "wait_for_nomad" {
  depends_on = [aws_lightsail_instance.debian_vm]

  provisioner "local-exec" {
    command = <<-SCRIPT
      for i in $(seq 1 60); do
        if curl -sf "http://${aws_lightsail_instance.debian_vm.public_ip_address}:4646/v1/status/leader" > /dev/null 2>&1; then
          echo "Nomad is ready."
          exit 0
        fi
        echo "Waiting for Nomad on ${aws_lightsail_instance.debian_vm.public_ip_address}:4646... ($$i/60)"
        sleep 5
      done
      echo "Nomad did not become ready in time."
      exit 1
    SCRIPT
  }

  triggers = {
    instance_id = aws_lightsail_instance.debian_vm.id
  }
}

locals {
  # Use the operator-supplied value when set, otherwise fall back to the
  # auto-generated secret. Keeps backend + postgres + livekit jobs in sync.
  postgres_password  = var.postgres_password != "" ? var.postgres_password : random_password.postgres.result
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  livekit_api_key    = var.livekit_api_key != "" ? var.livekit_api_key : random_string.livekit_api_key.result
  livekit_api_secret = var.livekit_api_secret != "" ? var.livekit_api_secret : random_password.livekit_api_secret.result

  database_url = var.database_url != "" ? var.database_url : "postgresql+psycopg2://${var.postgres_user}:${local.postgres_password}@127.0.0.1:5432/${var.postgres_db}"

  # Default the public-facing URLs to the served domain. Both are read by the
  # backend at runtime (email link base; wss endpoint relayed to the browser),
  # so they take effect without rebuilding any image. /livekit matches the
  # Caddy route that strips the prefix before proxying to the LiveKit server.
  frontend_base_url = var.frontend_base_url != "" ? var.frontend_base_url : "https://${var.domain}"
  livekit_url       = var.livekit_url != "" ? var.livekit_url : "wss://${var.domain}/livekit"
}

resource "nomad_job" "postgres" {
  depends_on = [null_resource.wait_for_nomad]

  jobspec = templatefile(
    "${path.module}/templates/postgres.nomad.tpl",
    {
      postgres_db       = var.postgres_db
      postgres_user     = var.postgres_user
      postgres_password = local.postgres_password
      timezone          = var.app_timezone
    }
  )
}

resource "nomad_job" "backend" {
  depends_on = [null_resource.wait_for_nomad, nomad_job.postgres]

  jobspec = templatefile(
    "${path.module}/templates/backend.nomad.tpl",
    {
      docker_image_backend    = var.docker_image_backend
      database_url            = local.database_url
      jwt_secret              = local.jwt_secret
      jwt_alg                 = var.jwt_alg
      jwt_expire_min          = var.jwt_expire_min
      cookie_secure           = var.cookie_secure
      cookie_samesite         = var.cookie_samesite
      cookie_domain           = var.cookie_domain
      cors_allow_origins      = var.cors_allow_origins
      master_consent_version  = var.master_consent_version
      app_timezone            = var.app_timezone
      livekit_url             = local.livekit_url
      livekit_api_key         = local.livekit_api_key
      livekit_api_secret      = local.livekit_api_secret
      s3_endpoint_url         = data.sops_file.secrets.data["cloudflare_r2.endpoint"]
      s3_region               = var.s3_region
      s3_bucket               = data.sops_file.secrets.data["cloudflare_r2.bucket_name"]
      s3_access_key_id        = data.sops_file.secrets.data["cloudflare_r2.access_key_id"]
      s3_secret_access_key    = data.sops_file.secrets.data["cloudflare_r2.secret_access_key"]
      s3_force_path_style     = var.s3_force_path_style
      resend_api_key          = data.sops_file.secrets.data["resend.api_key"]
      resend_from             = var.resend_from
      resend_reply_to         = var.resend_reply_to
      resend_webhook_secret   = var.resend_webhook_secret
      frontend_base_url       = local.frontend_base_url
      doctor_invite_ttl_hours = var.doctor_invite_ttl_hours
    }
  )
}

resource "nomad_job" "frontend" {
  depends_on = [null_resource.wait_for_nomad]

  jobspec = templatefile(
    "${path.module}/templates/frontend.nomad.tpl",
    {
      docker_image_frontend    = var.docker_image_frontend
      next_public_api_url      = var.next_public_api_url
      next_public_app_timezone = var.next_public_app_timezone
    }
  )
}