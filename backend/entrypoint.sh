#!/bin/sh
set -e

# Pull host:port out of DATABASE_URL (postgresql+psycopg2://user:pass@host:port/db)
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "[entrypoint] waiting for ${DB_HOST}:${DB_PORT}..."
until nc -z "${DB_HOST}" "${DB_PORT}"; do
    sleep 1
done
echo "[entrypoint] db is up"

echo "[entrypoint] running alembic migrations..."
alembic upgrade head

echo "[entrypoint] bootstrapping setup token (if uninitialized)..."
python -m app.scripts.bootstrap_setup_token || echo "[entrypoint] bootstrap_setup_token failed (continuing)"

echo "[entrypoint] seeding admin + healthworker accounts..."
python -m seed || echo "[entrypoint] seed failed (continuing)"

exec "$@"
