resource "aws_lightsail_instance" "debian_vm" {
  name              = "debian-vm"
  availability_zone = var.availability_zone
  blueprint_id      = "debian_13"
  bundle_id         = "small_3_1"

  # Cloud-init is now intentionally minimal: it only authorizes the SSH key
  # (so Ansible can connect) and drops the ansible-vault-encrypted secrets file
  # on disk. Everything else — Docker install, directories, rendering config and
  # bringing up the docker compose stack — is done by the Ansible playbook
  # (deployment/ansible/), which runs as a separate CI step. Debian 12 already
  # ships python3, so Ansible needs nothing more at boot.
  #
  # Built with yamlencode (not a hand-indented heredoc) because the vault
  # ciphertext is multi-line and whitespace-sensitive — yamlencode guarantees a
  # byte-exact round-trip when cloud-init reads the `content` value back.
  #
  # SECURITY: cloud-init user_data is retrievable from the instance metadata
  # endpoint and stored in Terraform state. The file written below is
  # ansible-vault ciphertext (see vault.tf), so it stays encrypted at rest both
  # here and on the VM disk. Changing any secret changes the ciphertext, which
  # (user_data being ForceNew) replaces the VM — rotate secrets deliberately.
  user_data = "#cloud-config\n${yamlencode({
    ssh_authorized_keys = [tls_private_key.vm_key.public_key_openssh]
    write_files = [{
      path        = "/etc/haputele/vault.yml"
      owner       = "root:root"
      permissions = "0600"
      content     = data.external.vault.result.ciphertext
    }]
  })}"

  tags = {
    Name = "debian-vm"
  }
}
