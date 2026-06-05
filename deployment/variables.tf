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
  description = "PostgreSQL password. Leave empty to auto-generate a random one (random_password.postgres)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "database_url" {
  description = "PostgreSQL connection string"
  type        = string
  default     = ""
}

variable "jwt_secret" {
  description = "Secret used to sign JWTs. Leave empty to auto-generate a random one (random_password.jwt_secret)."
  type        = string
  sensitive   = true
  default     = ""
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

variable "dns_subdomain" {
  description = "Subdomain for the haputele app"
  type        = string
  default     = "haputele"
}

variable "domain" {
  description = "Public FQDN Caddy serves. Its A record must point at the VM's public IP; Caddy auto-provisions a TLS cert for it."
  type        = string
  default     = "haputele.sightprojects.app"
}

variable "availability_zone" {
  description = "Lightsail availability zone. Must be a zone in the CI aws-region (ap-south-1). Not a secret, so it lives here rather than in sops."
  type        = string
  default     = "ap-south-1a"
}

variable "ansible_vault_password" {
  description = "Password used to ansible-vault-encrypt the combined secrets file baked into cloud-init and to decrypt it during the Ansible run. Set via TF_VAR_ansible_vault_password (GitHub secret ANSIBLE_VAULT_PASSWORD)."
  type        = string
  sensitive   = true
}

variable "ansible_user" {
  description = "SSH user Ansible connects as. Lightsail Debian 12 images default to 'admin' (cloud-init installs the TF public key there)."
  type        = string
  default     = "admin"
}

variable "next_public_app_timezone" {
  description = "App timezone inlined into the Next.js client bundle"
  type        = string
  default     = "Asia/Colombo"
}

variable "extra_authorized_keys" {
  description = "Additional SSH public keys authorized for the 'admin' user, appended after the Terraform-generated VM key. Default: operator keys from https://github.com/0xinterface.keys."
  type        = list(string)
  default = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO3XtOQIWQXzJBMwKZAHj+CdStqUfLqTn80zoIYHqpMY",
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL4hoqAr76JwTIlUXjR1kMeIfRifij65hBN5vlK7bfco",
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHPK+bR2JIzK43k8rGILOlJ07YaymhHoXcpjR69ngqoC",
    "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBG2h8OBT7O/X4jmyfKfODDrl84cjpcjbC7Ge3B4eoJf0EgVSqHjl7TK8MojnxjivoQl7kZGNHeoMJ/jUqSJqGW4=",
  ]
}