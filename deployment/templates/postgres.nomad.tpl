job "postgres" {
  region     = "global"
  datacenters = ["dc1"]
  type       = "service"

  group "postgres" {
    count = 1

    network {
      port "db" {
        static = 5432
      }
    }

    volume "postgres_data" {
      type      = "host"
      source    = "postgres_data"
      read_only = false
    }

    task "postgres" {
      driver = "docker"

      config {
        image = "postgres:16-alpine"
        ports = ["db"]
      }

      volume_mount {
        volume      = "postgres_data"
        destination = "/var/lib/postgresql/data"
      }

      env {
        POSTGRES_DB       = "${postgres_db}"
        POSTGRES_USER     = "${postgres_user}"
        POSTGRES_PASSWORD = "${postgres_password}"
        TZ                 = "${timezone}"
      }

      resources {
        cpu    = 250
        memory = 512
      }
    }
  }
}