data "external" "env" {
  program = ["jq", "-n", "env"]
}
