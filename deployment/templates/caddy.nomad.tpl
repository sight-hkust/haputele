job "caddy" {
  region      = "global"
  datacenters = ["dc1"]
  type        = "service"

  group "caddy" {
    count = 1

    network {
      mode = "host"
      port "http" {
        static = 80
      }
      port "https" {
        static = 443
      }
    }

    # Persist ACME certs/keys across restarts so Caddy doesn't re-provision
    # from Let's Encrypt every time (which risks hitting issuance rate limits).
    volume "caddy_data" {
      type      = "host"
      source    = "caddy_data"
      read_only = false
    }

    task "caddy" {
      driver = "docker"

      volume_mount {
        volume      = "caddy_data"
        destination = "/data"
      }

      template {
        destination = "local/Caddyfile"
        data        = <<-EOF
          # Serving a real hostname makes Caddy auto-provision a TLS cert via
          # ACME (HTTP-01 on :80) and serve HTTPS on :443. Requires the domain's
          # A record to point at this VM's public IP and ports 80+443 reachable.
          ${domain} {
            # Strip /livekit so the signaling WS (e.g. /livekit/rtc) reaches
            # the server at /rtc. Must match subpaths, not just bare /livekit.
            handle_path /livekit/* {
              reverse_proxy 127.0.0.1:7880
            }

            # Backend routers are mounted without an /api prefix (auth lives at
            # /auth, etc.), mirroring the next.config.mjs rewrite that strips
            # /api in dev. handle_path strips the prefix; plain handle would
            # forward /api/* verbatim and 404 at the backend.
            handle_path /api/* {
              reverse_proxy 127.0.0.1:8000
            }

            handle {
              reverse_proxy 127.0.0.1:3000
            }
          }
        EOF
      }

      config {
        image = "caddy:2-alpine"
        command = "caddy"
        args    = ["run", "--config", "/local/Caddyfile", "--adapter", "caddyfile"]
      }

      resources {
        cpu    = 250
        memory = 256
      }

      service {
        name = "caddy"
        port = "http"
        check {
          type     = "http"
          path     = "/"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
