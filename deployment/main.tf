data "external" "env" {
  program = ["jq", "-n", "env"]
}

resource "tls_private_key" "vm_key" {
  algorithm = "ED25519"
}
