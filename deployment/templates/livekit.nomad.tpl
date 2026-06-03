job "livekit" {
  region      = "global"
  datacenters = ["dc1"]
  type        = "service"

  group "livekit" {
    count = 1

    network {
      mode = "host"
    }

    task "livekit" {
      driver = "docker"

      config {
        image = "livekit/livekit-server:latest"
      }

      env {
        LIVEKIT_CONFIG = <<-EOT
          port: 7880
          rtc:
            tcp_port: 7881
            port_range_start: 50000
            port_range_end: 50100
            use_external_ip: true
          log_level: info
          keys:
            ${livekit_api_key}: ${livekit_api_secret}
        EOT
      }

      resources {
        cpu    = 1000
        memory = 512
      }

      service {
        name = "livekit"
        port = "7880"
        check {
          type     = "tcp"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
