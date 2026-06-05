#!/usr/bin/env bash
#
# Terraform external data source program (see deployment/vault.tf).
#
# Reads a JSON object from stdin:
#   { "plaintext": "<yaml secrets>", "vault_password": "<password>" }
# and prints a JSON object to stdout:
#   { "ciphertext": "<ansible-vault encrypted blob>" }
#
# Encryption is deterministic: ANSIBLE_VAULT_ENCRYPT_SALT pins the salt, so the
# same plaintext + password always yields byte-identical ciphertext. That keeps
# the Lightsail user_data stable across `terraform plan/apply` (no VM churn).
#
# Secrets arrive on stdin and are written only to mode-0600 temp files that are
# removed on exit — they never appear on the command line / process table.
set -euo pipefail

# Fixed salt for reproducible output. A single file encrypted with a strong,
# unique password does not benefit from a random per-run salt (its purpose is to
# decorrelate identical plaintexts across many files), and randomness here would
# force a VM rebuild on every apply. Must stay constant.
export ANSIBLE_VAULT_ENCRYPT_SALT="haputele-deploy-vault-salt-v1"

for bin in jq ansible-vault; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "error: '$bin' not found on PATH (required by the Terraform external data source)" >&2
    exit 1
  }
done

input="$(cat)"

ptfile="$(mktemp)"
pwfile="$(mktemp)"
chmod 600 "$ptfile" "$pwfile"
trap 'rm -f "$ptfile" "$pwfile"' EXIT

jq -r '.plaintext' <<<"$input" >"$ptfile"
jq -r '.vault_password' <<<"$input" | tr -d '\n' >"$pwfile"

ciphertext="$(ansible-vault encrypt --vault-password-file "$pwfile" --output - "$ptfile")"

jq -n --arg ct "$ciphertext" '{ciphertext: $ct}'
