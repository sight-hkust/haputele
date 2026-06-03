variable "docker_image_backend" {
  description = "Docker image for the haputele backend"
  type        = string
  default     = "ghcr.io/sight-hkust/haputele-backend:latest"
}

variable "docker_image_frontend" {
  description = "Docker image for the haputele frontend"
  type        = string
  default     = "ghcr.io/sight-hkust/haputele-frontend:latest"
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "haputele"
}

variable "postgres_user" {
  description = "PostgreSQL user"
  type        = string
  default     = "hapu"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "PostgreSQL connection string"
  type        = string
  default     = ""
}

variable "jwt_secret" {
  description = "Secret used to sign JWTs"
  type        = string
  sensitive   = true
}

variable "jwt_alg" {
  description = "JWT signing algorithm"
  type        = string
  default     = "HS256"
}

variable "jwt_expire_min" {
  description = "JWT expiration in minutes"
  type        = number
  default     = 480
}

variable "cookie_secure" {
  description = "Set HttpOnly session cookie Secure flag"
  type        = bool
  default     = true
}

variable "cookie_samesite" {
  description = "SameSite attribute for session cookie"
  type        = string
  default     = "lax"
}

variable "cookie_domain" {
  description = "Domain for session cookies (empty = host-only)"
  type        = string
  default     = ""
}

variable "cors_allow_origins" {
  description = "Comma-separated origins for CORS (empty = no cross-origin)"
  type        = string
  default     = ""
}

variable "master_consent_version" {
  description = "Default consent version for first-run wizard"
  type        = string
  default     = "v1"
}

variable "app_timezone" {
  description = "Application timezone"
  type        = string
  default     = "Asia/Colombo"
}

variable "livekit_url" {
  description = "LiveKit WebSocket URL exposed to browser"
  type        = string
  default     = ""
}

variable "livekit_api_key" {
  description = "LiveKit API key (server-side only)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "livekit_api_secret" {
  description = "LiveKit API secret (server-side only)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "s3_region" {
  description = "S3 region"
  type        = string
  default     = "auto"
}

variable "s3_force_path_style" {
  description = "Force path-style S3 URLs (required for non-AWS endpoints)"
  type        = bool
  default     = true
}

variable "resend_from" {
  description = "Sender address for Resend emails"
  type        = string
  default     = ""
}

variable "resend_reply_to" {
  description = "Reply-To address for Resend emails"
  type        = string
  default     = ""
}

variable "resend_webhook_secret" {
  description = "Svix signing secret for Resend webhooks"
  type        = string
  sensitive   = true
  default     = ""
}

variable "frontend_base_url" {
  description = "Public origin of the frontend (no trailing slash)"
  type        = string
  default     = ""
}

variable "doctor_invite_ttl_hours" {
  description = "How long a doctor invite token is valid (hours)"
  type        = number
  default     = 72
}

variable "next_public_api_url" {
  description = "Public API URL for Next.js client bundle"
  type        = string
  default     = ""
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token for DNS management"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for sightprojects.app"
  type        = string
}

variable "dns_subdomain" {
  description = "Subdomain for the haputele app"
  type        = string
  default     = "haputele"
}

variable "next_public_app_timezone" {
  description = "App timezone inlined into the Next.js client bundle"
  type        = string
  default     = "Asia/Colombo"
}