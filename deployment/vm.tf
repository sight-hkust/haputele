resource "aws_lightsail_instance" "debian_vm" {
  name              = "debian-vm"
  availability_zone = var.availability_zone
  blueprint_id      = "debian_13"
  bundle_id         = "small_3_1"

  # A plain bash launch script (NOT #cloud-config): it authorizes the SSH key so
  # Ansible can connect, and drops the ansible-vault-encrypted secrets file on
  # disk. Everything else — Docker install, directories, rendering config and
  # bringing up the docker compose stack — is done by the Ansible playbook
  # (deployment/ansible/), which runs as a separate CI step.
  #
  # Why not cloud-init: Lightsail does not reliably apply cloud-init's
  # ssh_authorized_keys / default-user modules, so a valid #cloud-config leaves
  # admin's authorized_keys empty and Ansible's SSH wait loop never connects
  # (Permission denied (publickey), even on a freshly built VM). The script
  # writes the key into /home/admin/.ssh directly. templatefile keeps the
  # multi-line vault ciphertext byte-exact (no HCL heredoc indentation to mangle
  # it).
  #
  # SECURITY: user_data is retrievable from the instance metadata endpoint and
  # stored in Terraform state. The secrets file written below is ansible-vault
  # ciphertext (see vault.tf), so it stays encrypted at rest both here and on
  # the VM disk. Changing any secret changes the ciphertext, which (user_data
  # being ForceNew) replaces the VM — rotate secrets deliberately.
  user_data = templatefile("${path.module}/templates/user-data.sh.tpl", {
    public_key            = trimspace(tls_private_key.vm_key.public_key_openssh)
    extra_authorized_keys = join("\n", var.extra_authorized_keys)
    vault_ciphertext      = data.external.vault.result.ciphertext
  })

  tags = {
    Name = "debian-vm"
  }
}
