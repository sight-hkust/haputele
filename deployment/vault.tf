# Produce the ansible-vault ciphertext that cloud-init bakes into the VM.
#
# data.external runs the encrypt script during plan/apply, passing the secrets
# and vault password as JSON on the program's stdin (never argv, so they don't
# leak into the process table). The script encrypts deterministically (fixed
# ANSIBLE_VAULT_ENCRYPT_SALT), so unchanged secrets produce byte-identical
# ciphertext and the aws_lightsail_instance user_data does not churn between
# applies. The CI runner (and local devs running plan) must have ansible-vault
# and jq installed and TF_VAR_ansible_vault_password set.
data "external" "vault" {
  program = ["bash", "${path.module}/scripts/ansible-vault-encrypt.sh"]

  query = {
    plaintext      = yamlencode(local.vault_secrets)
    vault_password = var.ansible_vault_password
  }
}
