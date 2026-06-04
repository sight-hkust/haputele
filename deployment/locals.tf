# Secret/config selection moved here when nomad.tf was removed. Each generated
# secret is used only when the matching var is left empty, so an operator can
# still pin a value explicitly.
locals {
  postgres_password  = var.postgres_password != "" ? var.postgres_password : random_password.postgres.result
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  livekit_api_key    = var.livekit_api_key != "" ? var.livekit_api_key : random_string.livekit_api_key.result
  livekit_api_secret = var.livekit_api_secret != "" ? var.livekit_api_secret : random_password.livekit_api_secret.result

  # The api reaches postgres over the docker compose network by service name
  # ("db"), not 127.0.0.1 as the old host-networked Nomad jobs did.
  database_url = var.database_url != "" ? var.database_url : "postgresql+psycopg2://${var.postgres_user}:${local.postgres_password}@db:5432/${var.postgres_db}"

  # Public-facing URLs default to the served domain. /livekit matches the Caddy
  # route that strips the prefix before proxying to the LiveKit signaling port.
  frontend_base_url = var.frontend_base_url != "" ? var.frontend_base_url : "https://${var.domain}"
  livekit_url       = var.livekit_url != "" ? var.livekit_url : "wss://${var.domain}/livekit"

  # Secrets only. Flat ENVVAR -> value map; yamlencoded, ansible-vault-encrypted
  # (see vault.tf), and shipped to the VM via cloud-init. The Ansible playbook
  # decrypts it and merges it into /opt/haputele/.env. DATABASE_URL lives here
  # because it embeds the postgres password.
  vault_secrets = {
    POSTGRES_PASSWORD     = local.postgres_password
    DATABASE_URL          = local.database_url
    JWT_SECRET            = local.jwt_secret
    LIVEKIT_API_KEY       = local.livekit_api_key
    LIVEKIT_API_SECRET    = local.livekit_api_secret
    S3_ENDPOINT_URL       = data.sops_file.secrets.data["cloudflare_r2.endpoint"]
    S3_BUCKET             = data.sops_file.secrets.data["cloudflare_r2.bucket_name"]
    S3_ACCESS_KEY_ID      = data.sops_file.secrets.data["cloudflare_r2.access_key_id"]
    S3_SECRET_ACCESS_KEY  = data.sops_file.secrets.data["cloudflare_r2.secret_access_key"]
    RESEND_API_KEY        = data.sops_file.secrets.data["resend.api_key"]
    RESEND_WEBHOOK_SECRET = var.resend_webhook_secret
  }

  # Non-secret config. Exposed as the ansible_extra_vars output, passed to the
  # playbook with `-e @vars.json`. Numbers/bools are stringified so they survive
  # the env-file round-trip and JSON typing cleanly.
  ansible_extra_vars = {
    domain                = var.domain
    docker_image_backend  = var.docker_image_backend
    docker_image_frontend = var.docker_image_frontend

    LIVEKIT_URL              = local.livekit_url
    FRONTEND_BASE_URL        = local.frontend_base_url
    POSTGRES_DB              = var.postgres_db
    POSTGRES_USER            = var.postgres_user
    JWT_ALG                  = var.jwt_alg
    JWT_EXPIRE_MIN           = tostring(var.jwt_expire_min)
    COOKIE_SECURE            = tostring(var.cookie_secure)
    COOKIE_SAMESITE          = var.cookie_samesite
    COOKIE_DOMAIN            = var.cookie_domain
    CORS_ALLOW_ORIGINS       = var.cors_allow_origins
    MASTER_CONSENT_VERSION   = var.master_consent_version
    APP_TIMEZONE             = var.app_timezone
    S3_REGION                = var.s3_region
    S3_FORCE_PATH_STYLE      = tostring(var.s3_force_path_style)
    RESEND_FROM              = var.resend_from
    RESEND_REPLY_TO          = var.resend_reply_to
    DOCTOR_INVITE_TTL_HOURS  = tostring(var.doctor_invite_ttl_hours)
    NEXT_PUBLIC_API_URL      = var.next_public_api_url
    NEXT_PUBLIC_APP_TIMEZONE = var.next_public_app_timezone
  }
}
