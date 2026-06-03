provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_record" "haputele" {
  zone_id = var.cloudflare_zone_id
  name    = var.dns_subdomain
  content = aws_lightsail_instance.debian_vm.public_ip_address
  type    = "A"
  proxied = false
  ttl     = 1
}