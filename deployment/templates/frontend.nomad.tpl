job "frontend" {
  region = "global"
  datacenters = ["dc1"]
  type = "service"

  group "frontend" {
    count = 1

    network {
      port "http" {
        static = 3000
      }
    }

    task "frontend" {
      driver = "docker"

      config {
        image = "${docker_image_frontend}"
        ports = ["http"]
      }

      env {
        NEXT_PUBLIC_API_URL      = "${next_public_api_url}"
        NEXT_PUBLIC_APP_TIMEZONE = "${next_public_app_timezone}"
      }

      resources {
        cpu    = 500
        memory = 512
      }
    }
  }
}