terraform {
  backend "http" {}
  required_providers {
    sops = {
      source  = "carlpett/sops"
      version = "1.4.1"
    }
  }
}
