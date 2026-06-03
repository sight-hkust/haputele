job "backend" {
  region = "global"
  datacenters = ["dc1"]
  type = "service"

  group "backend" {
    count = 1

    network {
      port "http" {
        static = 8000
      }
    }

    task "backend" {
      driver = "docker"

      config {
        image = "${docker_image_backend}"
        ports = ["http"]
      }

      env {
        CONFIG_FILE              = "/etc/haputele/config.yaml"
        DATABASE_URL             = "${database_url}"
        JWT_SECRET               = "${jwt_secret}"
        JWT_ALG                  = "${jwt_alg}"
        JWT_EXPIRE_MIN           = "${jwt_expire_min}"
        COOKIE_SECURE            = "${cookie_secure}"
        COOKIE_SAMESITE          = "${cookie_samesite}"
        COOKIE_DOMAIN            = "${cookie_domain}"
        CORS_ALLOW_ORIGINS       = "${cors_allow_origins}"
        MASTER_CONSENT_VERSION   = "${master_consent_version}"
        APP_TIMEZONE             = "${app_timezone}"
        LIVEKIT_URL              = "${livekit_url}"
        LIVEKIT_API_KEY          = "${livekit_api_key}"
        LIVEKIT_API_SECRET       = "${livekit_api_secret}"
        S3_ENDPOINT_URL          = "${s3_endpoint_url}"
        S3_REGION                = "${s3_region}"
        S3_BUCKET                = "${s3_bucket}"
        S3_ACCESS_KEY_ID         = "${s3_access_key_id}"
        S3_SECRET_ACCESS_KEY      = "${s3_secret_access_key}"
        S3_FORCE_PATH_STYLE      = "${s3_force_path_style}"
        RESEND_API_KEY           = "${resend_api_key}"
        RESEND_FROM              = "${resend_from}"
        RESEND_REPLY_TO          = "${resend_reply_to}"
        RESEND_WEBHOOK_SECRET    = "${resend_webhook_secret}"
        FRONTEND_BASE_URL        = "${frontend_base_url}"
        DOCTOR_INVITE_TTL_HOURS  = "${doctor_invite_ttl_hours}"
      }

      resources {
        cpu    = 500
        memory = 512
      }
    }
  }
}