#!/bin/sh
# Creates the Kratos and Hydra databases in the app's Postgres if they don't
# exist yet. Idempotent, so it also works on dev volumes created before Ory
# was added (docker-entrypoint-initdb.d only runs on an empty data dir).
# Connection settings come from PG* environment variables.
set -eu

for db in kratos hydra; do
    if [ -z "$(psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]; then
        psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db"
        echo "created database $db"
    fi
done
