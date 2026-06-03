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
    }

    task "caddy" {
      driver = "docker"

      template {
        destination = "local/Caddyfile"
        data        = <<-EOF
          :80 {
            handle_path /livekit {
              reverse_proxy 127.0.0.1:7880
            }

            @api path /api /api/*
            handle @api {
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
