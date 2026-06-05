# Auto-generated secrets for things this stack owns end-to-end. Each is used
# only when the corresponding var is left empty (see locals in nomad.tf), so an
# operator can still pin a value explicitly. special=false everywhere: these
# values get interpolated into a DSN, a YAML doc, and rendered Nomad jobspecs,
# where punctuation would otherwise need escaping.
#
# NOT generated here: Resend and Cloudflare R2 credentials — those are issued by
# third parties and come from sops (data.sops_file.secrets).

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

# LiveKit identifies the keypair by the api key (non-secret) and authenticates
# with the secret. The key is an identifier, so a plain random_string is fine.
resource "random_string" "livekit_api_key" {
  length  = 16
  special = false
}

resource "random_password" "livekit_api_secret" {
  length  = 40
  special = false
}
