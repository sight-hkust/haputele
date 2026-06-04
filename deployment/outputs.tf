output "vm_public_ip" {
  value = aws_lightsail_instance.debian_vm.public_ip_address
}

output "public_url" {
  value = "https://${var.domain}"
}

# Consumed by the Ansible CI step to SSH into the VM. Sensitive, but
# `terraform output -raw ssh_private_key` still prints it for the runner.
output "ssh_private_key" {
  value     = tls_private_key.vm_key.private_key_openssh
  sensitive = true
}

# Non-secret config for the Ansible run. A JSON string (jsonencode sidesteps
# Terraform's single-type-map rule for the mixed values); CI writes it out with
# `terraform output -raw ansible_extra_vars > vars.json` and passes `-e @vars.json`.
output "ansible_extra_vars" {
  value = jsonencode(local.ansible_extra_vars)
}
